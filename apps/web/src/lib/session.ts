export const SESSION_COOKIE = "tabaa_session";

const AUTH_PATHS = ["/connexion", "/inscription", "/mot-de-passe-oublie", "/reinitialiser"];
export const isAuthPath = (pathname: string) => AUTH_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

// Only same-site relative paths, never an auth page or a protocol-relative URL.
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  if (isAuthPath(next.split("?")[0]!) || next.startsWith("/session-expiree")) return "/";
  return next;
}
