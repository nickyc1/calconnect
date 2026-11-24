import { createClient } from '@/lib/supabase-server';
export async function isActivationAdmin() {
  const { data: { user } } = await createClient().auth.getUser();
  const allowed = (process.env.CALCONNECT_ADMIN_EMAILS || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
  return !!user?.email && !!user.email_confirmed_at && allowed.includes(user.email.toLowerCase());
}
