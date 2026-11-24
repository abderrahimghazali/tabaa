"use client";

import { createContext, useContext, useMemo } from "react";
import { makeT, type T } from "./i18n";
import type { Locale } from "./format";

const Ctx = createContext<{ locale: Locale; t: T }>({ locale: "fr", t: makeT("fr") });

export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const value = useMemo(() => ({ locale, t: makeT(locale) }), [locale]);
  return <Ctx value={value}>{children}</Ctx>;
}

export const useI18n = () => useContext(Ctx);
export const useT = () => useContext(Ctx).t;
