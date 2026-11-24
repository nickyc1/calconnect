import { randomUUID } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase';
export async function withOperationLock<T>(key: string, action: () => Promise<T>): Promise<T> {
  const owner = randomUUID();
  const db = supabaseAdmin as any;
  const { data, error } = await db.rpc('acquire_operation_lock', { lock_key: key, lock_owner: owner });
  if (error) throw error;
  if (!data) throw new Error('Another request is in progress. Please try again in a moment.');
  try { return await action(); }
  finally {
    const { error: releaseError } = await db.from('operation_locks').delete().eq('key', key).eq('owner', owner);
    if (releaseError) console.error('Operation lock release failed');
  }
}
