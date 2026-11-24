import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";

// The API rejected the session: drop the cookie here (cookies can be written in route handlers
// and server functions, not while rendering) and send the visitor to sign in.
export function GET(request: Request) {
  const res = NextResponse.redirect(new URL("/connexion?expired=1", request.url));
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
