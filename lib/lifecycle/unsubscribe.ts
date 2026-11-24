import { createHmac, timingSafeEqual } from 'crypto';
export function unsubscribeToken(userId: string) {
  const secret = process.env.LIFECYCLE_UNSUBSCRIBE_SECRET;
  if (!secret) throw new Error('Unsubscribe signing not configured');
  const signature = createHmac('sha256', secret).update(`lifecycle:${userId}`).digest('base64url');
  return `${userId}.${signature}`;
}
export function verifyUnsubscribe(token: string): string | null {
  const userId = token.split('.')[0];
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return null;
  try {
    const expected = Buffer.from(unsubscribeToken(userId));
    const received = Buffer.from(token);
    return expected.length === received.length && timingSafeEqual(expected, received) ? userId : null;
  } catch { return null; }
}
