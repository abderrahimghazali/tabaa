import "server-only";
import { cookies } from "next/headers";
import { makeT } from "./i18n";
import type { Locale } from "./format";

export async function getLocale(): Promise<Locale> {
  return (await cookies()).get("locale")?.value === "ar" ? "ar" : "fr";
}

export async function getT() {
  const locale = await getLocale();
  return { locale, t: makeT(locale) };
}
