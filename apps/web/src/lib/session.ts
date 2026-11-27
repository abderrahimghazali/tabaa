export const SESSION_COOKIE = "tabaa_session";
export const MFA_COOKIE = "tabaa_mfa";

const AUTH_PATHS = ["/connexion", "/inscription", "/mot-de-passe-oublie", "/reinitialiser", "/verification"];
// Never a sign-in destination: they end or reset a session.
const isTerminalPath = (pathname: string) => pathname.startsWith("/session-expiree") || pathname.startsWith("/espace-ferme");
// Reachable signed in or out. The invitation page is a valid `next`: signing in sends the person back to it.
export const isPublicPath = (pathname: string) => isTerminalPath(pathname) || pathname === "/invitation" || pathname === "/invitation/";
export const isAuthPath = (pathname: string) => AUTH_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

const ORIGIN = "http://tabaa.invalid";
// eslint-disable-next-line no-control-regex
const UNSAFE_CHARS = /[\u0000-\u001f\u007f\\]/;

/** A same-origin relative path (pathname + search) or "/". Never an auth page, an external URL or a protocol-relative one. */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || UNSAFE_CHARS.test(next)) return "/";
  // Encoded slashes or backslashes in the first segment, and anything that decodes to an unsafe path.
  const firstSegment = next.slice(1).split(/[/?#]/)[0]!;
  if (/%(2f|5c)/i.test(firstSegment)) return "/";
  let decoded: string;
  try {
    decoded = decodeURIComponent(next);
  } catch {
    return "/";
  }
  if (UNSAFE_CHARS.test(decoded) || decoded.startsWith("//")) return "/";
  let url: URL;
  try {
    url = new URL(next, ORIGIN);
  } catch {
    return "/";
  }
  if (url.origin !== ORIGIN || url.pathname.startsWith("//")) return "/";
  if (isAuthPath(url.pathname) || isTerminalPath(url.pathname)) return "/";
  return url.pathname + url.search;
}
