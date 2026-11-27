"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  ApiError,
  type AcceptInvitationInput,
  type CloseTenantInput,
  type Me,
  type ForgotPasswordInput,
  type MfaEnableInput,
  type MfaSetup,
  type MfaVerifyInput,
  type Reauth,
  type RecoveryCodes,
  type ResetPasswordInput,
  type SignInInput,
  type SignUpInput,
} from "@facture/core";
import { getT } from "./locale";
import { MFA_COOKIE, SESSION_COOKIE, safeNext } from "./session";
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

async function postJson<T>(path: string, body?: unknown): Promise<Result<T>> {
  const { res, error } = await post(path, body);
  if (error) {
    if (error.code === "FORBIDDEN") return { ok: false, error: { ...error, message: (await getT()).t("error.forbidden") } };
    return { ok: false, error };
  }
  return { ok: true, data: (await res.json()) as T };
}

// Re-issue one of the API's cookies to the browser under the same name and attributes.
async function forwardCookie(res: Response, name: string) {
  const raw = res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`));
  if (!raw) return;
  const [pair, ...attrs] = raw.split(";").map((p) => p.trim());
  const value = decodeURIComponent(pair!.slice(name.length + 1));
  const attr = (key: string) => attrs.find((a) => a.toLowerCase().startsWith(`${key}=`))?.split("=")[1];
  const maxAge = attr("max-age");
  const expires = attr("expires");
  (await cookies()).set(name, value, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV !== "development",
    ...(maxAge ? { maxAge: Number(maxAge) } : expires ? { expires: new Date(expires) } : {}),
  });
}

async function startSession(res: Response) {
  await forwardCookie(res, SESSION_COOKIE);
  const jar = await cookies();
  jar.delete(MFA_COOKIE);
  jar.delete("tabaa_mfa_tries");
}

const verificationUrl = (next?: string) => {
  const dest = safeNext(next);
  return dest === "/" ? "/connexion/verification" : `/connexion/verification?next=${encodeURIComponent(dest)}`;
};

export async function signIn(input: SignInInput, next?: string): Promise<Result<never>> {
  const { res, error } = await post("/auth/sign-in", input);
  if (error) return { ok: false, error };
  const body = (await res.json().catch(() => null)) as { mfaRequired?: boolean } | null;
  if (body?.mfaRequired) {
    await forwardCookie(res, MFA_COOKIE);
    (await cookies()).delete("tabaa_mfa_tries");
    redirect(verificationUrl(next));
  }
  await startSession(res);
  redirect(safeNext(next));
}

const MFA_TRIES = "tabaa_mfa_tries";
const MFA_MAX_TRIES = 5;

async function dropChallenge(): Promise<never> {
  const jar = await cookies();
  jar.delete(MFA_COOKIE);
  jar.delete(MFA_TRIES);
  redirect("/connexion?mfa=expired");
}

/**
 * Second step of sign-in: a six-digit code or one recovery code.
 * The API answers INVALID_CODE for a wrong code, a dead challenge and a missing cookie alike,
 * so the challenge's lifetime is tracked here: no cookie means it expired, five misses end it.
 */
export async function verifyMfa(input: MfaVerifyInput, next?: string): Promise<Result<never>> {
  const jar = await cookies();
  if (!jar.get(MFA_COOKIE)) return dropChallenge();
  const { res, error } = await post("/auth/mfa/verify", input);
  if (error) {
    if (error.code === "INVALID_CODE") {
      const tries = Number(jar.get(MFA_TRIES)?.value ?? 0) + 1;
      if (tries >= MFA_MAX_TRIES) return dropChallenge();
      jar.set(MFA_TRIES, String(tries), { httpOnly: true, sameSite: "lax", path: "/", secure: process.env.NODE_ENV !== "development", maxAge: 300 });
      return { ok: false, error };
    }
    if (error.code === "VALIDATION" || error.code === "UNREACHABLE") return { ok: false, error };
    return dropChallenge();
  }
  jar.delete(MFA_TRIES);
  await startSession(res);
  redirect(safeNext(next));
}

/** Sign-up never signs in: it always answers "check your inbox". */
export async function signUp(input: SignUpInput): Promise<Result<{ status: "PENDING_VERIFICATION" }>> {
  return postJson("/auth/sign-up", input);
}

export async function verifyEmail(token: string): Promise<Result<never>> {
  const { res, error } = await post("/auth/verify-email", { token });
  if (error) return { ok: false, error };
  await startSession(res);
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

async function endSession() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(MFA_COOKIE);
  jar.delete("tabaa_mfa_tries");
}

export async function signOut(): Promise<void> {
  await post("/auth/sign-out");
  await endSession();
  redirect("/connexion");
}

export async function signOutTo(next: string): Promise<void> {
  await post("/auth/sign-out");
  await endSession();
  redirect(safeNext(next));
}

export async function signOutAll(): Promise<void> {
  await post("/auth/sign-out-all");
  await endSession();
  redirect("/connexion");
}

export async function setupMfa() {
  return postJson<MfaSetup>("/auth/mfa/setup");
}

export async function enableMfa(input: MfaEnableInput) {
  const res = await postJson<RecoveryCodes>("/auth/mfa/enable", input);
  if (res.ok) revalidatePath("/", "layout");
  return res;
}

export async function disableMfa(input: Reauth): Promise<Result<null>> {
  const { error } = await post("/auth/mfa/disable", input);
  if (error) return { ok: false, error };
  revalidatePath("/", "layout");
  return { ok: true, data: null };
}

export async function regenerateRecoveryCodes(input: Reauth) {
  return postJson<RecoveryCodes>("/auth/mfa/recovery-codes", input);
}

export async function closeWorkspace(input: CloseTenantInput): Promise<Result<never>> {
  const { error } = await post("/tenant/close", input);
  if (error) {
    if (error.code === "FORBIDDEN") return { ok: false, error: { ...error, message: (await getT()).t("error.forbidden") } };
    return { ok: false, error };
  }
  await endSession();
  redirect("/espace-ferme");
}

/** Leaving the active workspace revokes this session: the user signs in again. */
export async function leaveWorkspace(userId: string): Promise<Result<never>> {
  const res = await fetch(`${apiRoot()}/v1/team/members/${encodeURIComponent(userId)}`, {
    method: "DELETE",
    cache: "no-store",
    headers: await upstreamHeaders(false),
  }).catch(() => null);
  if (!res || !res.ok) {
    const parsed = ApiError.safeParse(await res?.json().catch(() => null));
    return { ok: false, error: parsed.success ? parsed.data : { code: "UNKNOWN", message: "HTTP error" } };
  }
  await endSession();
  redirect("/connexion");
}

/** Accepts an invitation: creates the account when none exists, or adds the membership for the signed-in user. */
export async function acceptInvitation(input: AcceptInvitationInput): Promise<Result<never>> {
  const { res, error } = await post("/auth/invitations/accept", input);
  if (error) return { ok: false, error };
  await startSession(res);
  revalidatePath("/", "layout");
  redirect("/");
}

export async function switchWorkspace(tenantId: string): Promise<Result<Me>> {
  const { res, error } = await post("/auth/switch-tenant", { tenantId });
  if (error) {
    if (error.code === "FORBIDDEN") return { ok: false, error: { ...error, message: (await getT()).t("error.forbidden") } };
    return { ok: false, error };
  }
  await forwardCookie(res, SESSION_COOKIE);
  revalidatePath("/", "layout");
  return { ok: true, data: (await res.json()) as Me };
}
