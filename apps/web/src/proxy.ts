import { NextResponse, type NextRequest } from "next/server";
import { buildCsp } from "@/lib/csp";
import { SESSION_COOKIE, isAuthPath, isPublicPath } from "@/lib/session";

function withCsp(response: NextResponse, csp: string) {
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

// Optimistic check on cookie presence only; the app shell verifies the session with the API.
export function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce);
  const { pathname, search } = request.nextUrl;
  const signedIn = request.cookies.has(SESSION_COOKIE);

  if (!isPublicPath(pathname)) {
    if (!signedIn && !isAuthPath(pathname)) {
      const url = new URL("/connexion", request.url);
      if (pathname !== "/") url.searchParams.set("next", pathname + search);
      return withCsp(NextResponse.redirect(url), csp);
    }
    if (signedIn && isAuthPath(pathname) && !pathname.startsWith("/reinitialiser") && !pathname.startsWith("/verification")) {
      return withCsp(NextResponse.redirect(new URL("/", request.url)), csp);
    }
  }

  // Next reads the nonce from the request's CSP header and applies it to its own scripts and styles.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  return withCsp(NextResponse.next({ request: { headers: requestHeaders } }), csp);
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|icon\\.svg|favicon\\.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
