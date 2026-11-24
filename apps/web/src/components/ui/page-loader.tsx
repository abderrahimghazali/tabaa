"use client";

import { useT } from "@/lib/i18n-client";
import { BrandLoader } from "./brand";

export function PageLoader() {
  const t = useT();
  return (
    <div className="grid min-h-[60dvh] place-items-center" aria-busy="true">
      <BrandLoader label={t("common.loading")} />
    </div>
  );
}
