import "server-only";
import { isIP } from "node:net";
import { cookies, headers } from "next/headers";
import { MFA_COOKIE, SESSION_COOKIE } from "./session";

export function apiRoot(): string {
  return (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4100").replace(/\/v1\/?$/, "");
}

function internalToken(): string {
  const token = process.env.INTERNAL_API_TOKEN;
  if (!token) throw new Error("INTERNAL_API_TOKEN is not set. Add it to the root .env (it must match the API's value).");
  return token;
}

// First hop of x-forwarded-for, else x-real-ip; only a syntactically valid IP is ever forwarded.
export async function clientIp(): Promise<string | undefined> {
  const h = await headers();
  const raw = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim();
  if (!raw) return undefined;
  const bare = raw.replace(/^\[(.*)\](:\d+)?$/, "$1").replace(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/, "$1");
  return isIP(bare) ? bare : undefined;
}

/** Headers every server-side call to the API carries: the session, the shared secret, and the browser's address. */
export async function upstreamHeaders(json: boolean): Promise<Record<string, string>> {
  const [jar, ip] = await Promise.all([cookies(), clientIp()]);
  const pairs = [SESSION_COOKIE, MFA_COOKIE].flatMap((name) => {
    const v = jar.get(name)?.value;
    return v ? [`${name}=${v}`] : [];
  });
  return {
    "x-internal-token": internalToken(),
    ...(ip && { "x-client-ip": ip }),
    ...(pairs.length && { cookie: pairs.join("; ") }),
    ...(json && { "content-type": "application/json" }),
  };
}
