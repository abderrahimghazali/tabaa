import { createHmac, timingSafeEqual } from "node:crypto";

export const RENDER_TOKEN_TTL_MS = 60_000;

const mac = (secret: string, id: string, exp: number) =>
  createHmac("sha256", secret).update(`render-pdf:${id}:${exp}`).digest("base64url");

export function signRenderToken(secret: string, id: string, now = Date.now()): string {
  const exp = now + RENDER_TOKEN_TTL_MS;
  return `${exp}.${mac(secret, id, exp)}`;
}

export function verifyRenderToken(secret: string, id: string, token: string | undefined, now = Date.now()): boolean {
  const match = /^(\d{10,16})\.([A-Za-z0-9_-]{43})$/.exec(token ?? "");
  if (!match) return false;
  const exp = Number(match[1]);
  if (exp < now || exp > now + RENDER_TOKEN_TTL_MS) return false;
  const given = Buffer.from(match[2]);
  const expected = Buffer.from(mac(secret, id, exp));
  return given.length === expected.length && timingSafeEqual(given, expected);
}
