const rows: any[] = [];
const profiles: any[] = [];
const mockDb = { from: jest.fn((table: string) => {
  let action = 'select', values: any, filters: any[] = [];
  const q: any = {
    select: () => q, eq: (k: string, v: any) => { filters.push([k,v]); return q; },
    maybeSingle: () => Promise.resolve({ data: rows.find(r => filters.every(([k,v]) => r[k] === v)) || null }),
    upsert: (v: any) => { const r = rows.find(r => r.user_id === v.user_id && r.step === v.step); r ? Object.assign(r,v) : rows.push({id:'row-1',...v}); return Promise.resolve({error:null}); },
    update: (v: any) => { action='update'; values=v; return q; },
    then: (resolve: any) => { const matched=(table==='lifecycle_outbox'?rows:profiles).filter(r=>filters.every(([k,v])=>r[k]===v)); if(action==='update') matched.forEach(r=>Object.assign(r,values)); return Promise.resolve({data:matched,error:null}).then(resolve); },
  }; return q;
}) };
jest.mock('@/lib/supabase', () => ({ supabaseAdmin: mockDb }));
import { queueNext, deliverRow } from '@/lib/lifecycle/worker';
const fresh: any = {step:'welcome',payload:{to:'owner@example.com',from:'Nick <support@calconnect.io>',replyTo:'owner@example.com',subject:'Welcome',text:'Hello',address:'Test address'}};
const resolve: any = jest.fn(async () => structuredClone(fresh));
beforeEach(() => { rows.length=0; profiles.length=0; profiles.push({user_id:'00000000-0000-4000-8000-000000000001'}); resolve.mockReset().mockResolvedValue(structuredClone(fresh)); global.fetch=jest.fn().mockResolvedValue({ok:true,json:async()=>({id:'provider-1'})}); });
const id='00000000-0000-4000-8000-000000000001';
test('automatic queue is idempotent and sends one exact message with unsubscribe headers',async()=>{
  expect(await queueNext(id,resolve)).toBe(true);
  expect(await queueNext(id,resolve)).toBe(false);
  expect(rows).toHaveLength(1);
  expect(await deliverRow({...rows[0]},resolve)).toBe(true);
  expect(await deliverRow({...rows[0]},resolve)).toBe(false);
  expect(await queueNext(id,resolve)).toBe(false);
  expect(fetch).toHaveBeenCalledTimes(1);
  const body=JSON.parse((fetch as jest.Mock).mock.calls[0][1].body);
  expect(body.to).toEqual(['owner@example.com']);
  expect(body.reply_to).toBe('owner@example.com');
  expect(body.text).toContain('Unsubscribe:');
  expect(body.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
  expect(rows[0].provider_id).toBe('provider-1');
});
test('revoked eligibility after queueing skips delivery',async()=>{
  await queueNext(id,resolve); resolve.mockResolvedValue(null);
  expect(await deliverRow({...rows[0]},resolve)).toBe(false);
  expect(rows[0].status).toBe('skipped'); expect(fetch).not.toHaveBeenCalled();
});
test('changed copy is not sent from a stale queue',async()=>{
  await queueNext(id,resolve); resolve.mockResolvedValue({...fresh,payload:{...fresh.payload,text:'Changed'}});
  expect(await deliverRow({...rows[0]},resolve)).toBe(false); expect(fetch).not.toHaveBeenCalled();
  expect(await queueNext(id,resolve)).toBe(true); expect(rows[0].payload.text).toBe('Changed');
});
test('ambiguous provider outcome is preserved and never automatically requeued',async()=>{
  await queueNext(id,resolve); (fetch as jest.Mock).mockRejectedValue(new Error('timeout'));
  expect(await deliverRow({...rows[0]},resolve)).toBe(false); expect(rows[0].status).toBe('unknown');
  expect(await queueNext(id,resolve)).toBe(false);
});
