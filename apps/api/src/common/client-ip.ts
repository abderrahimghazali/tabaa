import { timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { env } from '../env.js';

// Length is not secret; equal lengths are needed by timingSafeEqual.
function sameToken(given: string, expected: string) {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function hasInternalToken(req: { headers: Record<string, unknown> }) {
  const token = req.headers['x-internal-token'];
  return typeof token === 'string' && sameToken(token, env.internalToken);
}

// X-Client-IP is only believed from the web server, which proves itself with the shared token.
export function resolveClientIp(req: { headers: Record<string, unknown>; socket: { remoteAddress?: string } }) {
  const token = req.headers['x-internal-token'];
  const forwarded = req.headers['x-client-ip'];
  if (
    typeof token === 'string' &&
    typeof forwarded === 'string' &&
    sameToken(token, env.internalToken) &&
    isIP(forwarded.trim())
  ) {
    return forwarded.trim();
  }
  return (req.socket.remoteAddress ?? '').replace(/^::ffff:/, '');
}

export function clientIpMiddleware(req: any, _res: unknown, next: () => void) {
  req.clientIp = resolveClientIp(req);
  next();
}

export const requestInfo = (req: any) => ({
  ip: (req.clientIp as string | undefined) ?? resolveClientIp(req),
  userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'].slice(0, 300) : undefined,
});
