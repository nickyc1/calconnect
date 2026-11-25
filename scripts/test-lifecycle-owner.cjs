/* Explicit owner-only E2E harness. Never used by the cron or web routes.
 * Uses real outbox/transport/unsubscribe, with a synthetic welcome-stage scenario.
 * No billing/calendar changes. Restores the owner's preference fields in finally.
 */
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (name, parent, ...args) {
  return originalResolve.call(this, name.startsWith('@/') ? path.join(root, name.slice(2)) : name, parent, ...args);
};
require.extensions['.ts'] = (m, filename) => m._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, filename);
const { supabaseAdmin: db } = require('../lib/supabase.ts');
const { queueNext, deliverRow } = require('../lib/lifecycle/worker.ts');
const { withOperationLock } = require('../lib/operation-lock.ts');
const { renderEmail, nextStep } = require('../lib/lifecycle/sequences.ts');
const { unsubscribeToken } = require('../lib/lifecycle/unsubscribe.ts');
const recipient = 'n.christensen4@gmail.com';
const marker = 'test:e2e-owner-v1:';
async function query(q) { const r = await q; if (r.error) throw new Error(r.error.message); return r.data; }
async function disabled() {
  const r=await fetch('https://www.calconnect.io/api/cron/lifecycle',{headers:{Authorization:`Bearer ${process.env.CRON_SECRET}`}});
  assert.equal(r.status,200); assert.deepEqual(await r.json(),{enabled:false,sent:0});
}
async function main() {
  await disabled();
  let user;
  for(let page=1;page<100;page++) {
    const {data,error}=await db.auth.admin.listUsers({page,perPage:100}); if(error) throw new Error('User lookup failed');
    user=data.users.find(u=>u.email?.toLowerCase()===recipient); if(user||data.users.length<100)break;
  }
  assert.ok(user?.email_confirmed_at,'Verified owner account required');
  const before=await query(db.from('activation_profiles').select('*').eq('user_id',user.id).maybeSingle());
  if(process.argv[2]==='inspect') { console.log(JSON.stringify({ownerFound:true,profileExists:!!before,suppressed:before?.suppressed||false,enrolled:!!before?.enrolled_at})); return; }
  assert.equal(process.argv[2],'send','Use inspect or send');
  assert.ok(!before?.suppressed,'Do not override provider suppression');
  // A fixed marker makes this invocation non-repeatable after a successful/ambiguous send.
  const old=await query(db.from('lifecycle_outbox').select('status').eq('user_id',user.id).like('step',marker+'%'));
  assert.equal(old.length,0,'This test already has receipts; reconcile before another run');
  const fields=['email_opt_in_at','unsubscribed_at','cohort','enrolled_at','last_email_at'];
  const restore=Object.fromEntries(fields.map(k=>[k,before?.[k]??null]));
  const fixture={stage:'first_calendar',calendars:0,sources:0,readySources:0,entitled:true,needsReauth:false,firstMirrorAt:null,confirmedAt:null,supportOpen:false};
  const resolve=async id=>{
    assert.equal(id,user.id);
    const profile=await query(db.from('activation_profiles').select('*').eq('user_id',id).maybeSingle());
    const history=await query(db.from('lifecycle_outbox').select('step,status').eq('user_id',id).like('step',marker+'%'));
    if(history.some(r=>['unknown','sending'].includes(r.status)))return null;
    const step=nextStep(fixture,profile,history.filter(r=>r.status==='sent').map(r=>r.step.slice(marker.length)));
    if(!step)return null;
    const copy=renderEmail(step,fixture,'https://www.calconnect.io');
    return {step:marker+step,payload:{to:recipient,from:'Nick from CalConnect <support@calconnect.io>',replyTo:recipient,version:'owner-e2e-v1',subject:'[E2E test] '+copy.subject,text:copy.text,address:'[Internal test only: business mailing address pending. Customer delivery is disabled.]'}};
  };
  try {
    const now=new Date().toISOString();
    await query(db.from('activation_profiles').upsert({user_id:user.id,email_opt_in_at:now,unsubscribed_at:null,cohort:'new',enrolled_at:now,last_email_at:null}));
    await withOperationLock(`lifecycle:${user.id}`,async()=>{
      assert.equal(await queueNext(user.id,resolve),true);
      assert.equal(await queueNext(user.id,resolve),false);
      const row=await query(db.from('lifecycle_outbox').select('*').eq('user_id',user.id).eq('step',marker+'welcome').single());
      assert.equal(await deliverRow(row,resolve),true,'Provider acceptance required; inspect unknown row before retry');
      assert.equal(await deliverRow(row,resolve),false,'Replay must not send twice');
    });
    const row=await query(db.from('lifecycle_outbox').select('id,status,provider_id').eq('user_id',user.id).eq('step',marker+'welcome').single());
    assert.equal(row.status,'sent');
    const link='https://www.calconnect.io/api/lifecycle/unsubscribe?token='+encodeURIComponent(unsubscribeToken(user.id));
    assert.equal((await fetch(link)).status,200);
    let profile=await query(db.from('activation_profiles').select('*').eq('user_id',user.id).single());
    assert.ok(profile.email_opt_in_at); assert.equal(profile.unsubscribed_at,null);
    assert.equal((await fetch(link,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'List-Unsubscribe=One-Click'})).status,200);
    profile=await query(db.from('activation_profiles').select('*').eq('user_id',user.id).single());
    assert.equal(profile.email_opt_in_at,null); assert.ok(profile.unsubscribed_at);
    assert.equal(await resolve(user.id),null);
    console.log(JSON.stringify({test:'passed',scenario:'synthetic welcome state on real owner account',outboxId:row.id,providerId:row.provider_id,queueDedup:true,sendReplayBlocked:true,unsubscribeGetReadOnly:true,unsubscribePostSuppresses:true}));
  } finally {
    await query(db.from('activation_profiles').upsert({user_id:user.id,...restore}));
    const after=await query(db.from('activation_profiles').select('*').eq('user_id',user.id).single());
    for(const f of fields)assert.equal(after[f],restore[f]);
    await disabled();
    console.log('Owner preferences restored. Customer delivery remains OFF.');
  }
}
main().catch(e=>{console.error('Owner test stopped:',e.message);process.exitCode=1;});
