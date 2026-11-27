// Only sign-in style routes: an email field on a customer or the company is not an account.
export function accountEmail(req: { url?: string; originalUrl?: string; body?: { email?: unknown } }): string {
  if (!(req.originalUrl ?? req.url ?? '').startsWith('/v1/auth/')) return '';
  const email = req.body?.email;
  return typeof email === 'string' ? email.trim().normalize('NFC').toLowerCase() : '';
}
