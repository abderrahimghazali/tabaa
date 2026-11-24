"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ApiError, type ForgotPasswordInput, type ResetPasswordInput, type SignInInput, type SignUpInput } from "@facture/core";
import { SESSION_COOKIE, safeNext } from "./session";
import { apiRoot, upstreamHeaders } from "./upstream";
import type { Result } from "./result";


async function post(path: string, body?: unknown): Promise<{ res: Response; error?: ApiError }> {
  let res: Response;
  try {
    res = await fetch(`${apiRoot()}/v1${path}`, {
      method: "POST",
      cache: "no-store",
      headers: await upstreamHeaders(body !== undefined),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    return { res: new Response(null, { status: 0 }), error: { code: "UNREACHABLE", message: "API unreachable" } };
  }
  if (res.ok) return { res };
  const parsed = ApiError.safeParse(await res.json().catch(() => null));
  return { res, error: parsed.success ? parsed.data : { code: "UNKNOWN", message: `HTTP ${res.status}` } };
}

// Re-issue the API's session cookie to the browser under the same name and attributes.
async function forwardSession(res: Response) {
  const raw = res.headers.getSetCookie().find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  if (!raw) return;
  const [pair, ...attrs] = raw.split(";").map((p) => p.trim());
  const value = decodeURIComponent(pair!.slice(SESSION_COOKIE.length + 1));
  const attr = (name: string) => attrs.find((a) => a.toLowerCase().startsWith(`${name}=`))?.split("=")[1];
  const maxAge = attr("max-age");
  const expires = attr("expires");
  (await cookies()).set(SESSION_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV !== "development",
    ...(maxAge ? { maxAge: Number(maxAge) } : expires ? { expires: new Date(expires) } : {}),
  });
}

export async function signIn(input: SignInInput, next?: string): Promise<Result<never>> {
  const { res, error } = await post("/auth/sign-in", input);
  if (error) return { ok: false, error };
  await forwardSession(res);
  redirect(safeNext(next));
}

export async function signUp(input: SignUpInput): Promise<Result<never>> {
  const { res, error } = await post("/auth/sign-up", input);
  if (error) return { ok: false, error };
  await forwardSession(res);
  redirect("/parametres/entreprise");
}

export async function forgotPassword(input: ForgotPasswordInput): Promise<void> {
  await post("/auth/password/forgot", input);
}

export async function resetPassword(input: ResetPasswordInput): Promise<Result<never>> {
  const { error } = await post("/auth/password/reset", input);
  if (error) return { ok: false, error };
  redirect("/connexion?reset=1");
}

export async function signOut(): Promise<void> {
  await post("/auth/sign-out");
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/connexion");
}

export async function signOutAll(): Promise<void> {
  await post("/auth/sign-out-all");
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/connexion");
}
