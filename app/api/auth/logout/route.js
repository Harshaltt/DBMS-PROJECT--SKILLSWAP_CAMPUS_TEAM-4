import { route, json } from '@/lib/api';
import { clearSessionCookie } from '@/lib/auth';

export const POST = route(async () => {
  await clearSessionCookie();
  return json({ ok: true });
}, { roles: 'public' });
