import Link from "next/link";
import { RiArrowRightSLine } from "@remixicon/react";
import type { PurchaseList } from "@facture/core";
import { Card } from "@/components/app/layout";
import { Money } from "@/components/app/money";
import type { Locale } from "@/lib/format";
import type { T } from "@/lib/i18n";
import { cx } from "@/utils/cx";

/** Purchases at a glance: what waits for approval, what is owed to suppliers, what is late. Each figure opens the matching list. */
export function SuppliersCard({ overview: o, t, locale, canApprove }: { overview: PurchaseList["overview"]; t: T; locale: Locale; canApprove: boolean }) {
  const rows = [
    ...(canApprove ? [{ key: "toApprove", label: t("purchases.ov.toApprove"), value: <span className="num">{o.toApprove}</span>, href: "/achats?state=TO_APPROVE", tone: o.toApprove > 0 }] : []),
    { key: "unpaid", label: t("purchases.ov.unpaid"), value: <Money value={o.unpaidTotal} locale={locale} />, href: "/achats?state=APPROVED", tone: false },
    { key: "overdue", label: t("purchases.ov.overdue"), value: <Money value={o.overdueTotal} locale={locale} />, href: "/achats?overdue=1", tone: Number(o.overdueTotal) > 0 },
  ];
  return (
    <Card className="min-w-0 p-5">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-headline-semibold text-text-primary">{t("dash.suppliers")}</h2>
        <Link href="/achats" className="text-body-medium text-accent-600 hover:underline">{t("dash.suppliersAll")}</Link>
      </div>
      <ul className="-mx-2 grid">
        {rows.map((r) => (
          <li key={r.key}>
            <Link href={r.href} className="flex min-h-11 items-center justify-between gap-3 rounded-xl px-2 py-2 outline-none transition-colors hover:bg-background-secondary-default focus-visible:ring-2 focus-visible:ring-border-focus-ring">
              <span className="text-body-regular text-text-secondary">{r.label}</span>
              <span className={cx("flex items-center gap-1 text-body-medium", r.tone ? "text-text-error-primary" : "text-text-primary")}>
                {r.value}
                <RiArrowRightSLine className="size-4 text-foreground-icon-tertiary rtl:-scale-x-100" aria-hidden />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
