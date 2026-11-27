import { RiAddLine, RiArrowRightSLine, RiBankLine } from "@remixicon/react";
import Link from "next/link";
import { connection } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { getBankToMatch, getDashboard, getMe, getPurchaseOverview, requireCompany } from "@/lib/data";
import { daysBetween, fmtNumber, longDate, todayIso } from "@/lib/format";
import { getT } from "@/lib/locale";
import { Card, PageHeader } from "@/components/app/layout";
import { ButtonLink } from "@/components/base/buttons/button";
import { AgingCard, RingCard } from "@/components/dashboard/aging-ring";
import { Echeancier } from "@/components/dashboard/echeancier";
import { InvoicedCollectedChart } from "@/components/dashboard/invoiced-collected-chart";
import { Kpis } from "@/components/dashboard/kpis";
import { RecentInvoices, RecentPayments, TopCustomers } from "@/components/dashboard/lists";
import { SuppliersCard } from "@/components/dashboard/suppliers-card";
import { can } from "@/lib/permissions";
import { MfaPrompt } from "@/components/app/mfa-prompt";
import { WriteOnly } from "@/components/app/write-only";
import { TopbarActions } from "@/components/frame";
import { MobileActionBar } from "@/components/app/mobile-actions";

export default async function DashboardPage() {
  const { t, locale } = await getT();
  const company = await requireCompany();
  const d = await getDashboard();
  const bank = await getBankToMatch().catch((e) => {
    unstable_rethrow(e);
    return 0;
  });
  const purchases = await getPurchaseOverview().catch((e) => {
    unstable_rethrow(e);
    return null;
  });
  const me = await getMe();
  await connection();
  const today = todayIso();
  const soon = d.receivables.filter((r) => {
    const days = daysBetween(r.dueDate, today);
    return days >= 0 && days <= 14;
  }).length;

  const summary = [
    d.overdueCount > 0
      ? t(d.overdueCount === 1 ? "dash.sumLateOne" : "dash.sumLate", { n: d.overdueCount, amount: `${fmtNumber(d.overdue)} ${locale === "ar" ? "د.م" : "DH"}` })
      : t("dash.sumNoLate"),
    soon > 0 ? t(soon === 1 ? "dash.sumSoonOne" : "dash.sumSoon", { n: soon }) : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div>
      <TopbarActions>
        <WriteOnly>
          <ButtonLink href="/factures/nouvelle" leadingIcon={RiAddLine}>
            {t("invoices.new")}
          </ButtonLink>
        </WriteOnly>
      </TopbarActions>

      <PageHeader
        title={
          <>
            <span className="max-nav:hidden">{t("dash.greeting", { name: company.name })}</span>
            <span className="nav:hidden">{t("dash.hi")}</span>
          </>
        }
        subtitle={
          <>
            <span className="mb-0.5 block text-title-3-medium text-text-primary wrap-break-word nav:hidden">{company.name}</span>
            <span className="first-letter:uppercase">{longDate(today, locale)}</span>
            {" · "}
            {summary}
          </>
        }
      />

      {bank > 0 && (
        <Link
          href="/banque"
          className="mb-4 flex min-h-11 items-center gap-2.5 rounded-2xl bg-background-secondary-default px-4 py-2.5 text-body-medium text-text-primary outline-none transition-colors hover:bg-background-secondary-hover focus-visible:ring-2 focus-visible:ring-border-focus-ring"
        >
          <RiBankLine className="size-5 shrink-0 text-foreground-icon-secondary" aria-hidden />
          <span className="min-w-0 flex-1">{t("dash.bankToMatch", { n: bank })}</span>
          <RiArrowRightSLine className="size-5 shrink-0 text-foreground-icon-secondary rtl:-scale-x-100" aria-hidden />
        </Link>
      )}

      <MfaPrompt />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
        <Kpis d={d} />

        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 wide:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
          <InvoicedCollectedChart monthly={d.monthly} />
          <div className="grid grid-cols-[minmax(0,1fr)] content-start gap-4">
            <AgingCard aging={d.aging} />
            <RingCard days={d.averageDaysToPay} />
            {purchases && <SuppliersCard overview={purchases} t={t} locale={locale} canApprove={can(me.role, "admin")} />}
          </div>
        </div>

        <Card className="min-w-0 p-5">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
            <div>
              <h3 className="text-headline-medium text-text-primary">{t("dash.timeline")}</h3>
              <p className="text-body-regular text-text-secondary">{t("dash.timelineHint")}</p>
            </div>
            <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-caption-1-medium text-text-secondary">
              <li className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-foreground-icon-error" />{t("dash.legendLate")}</li>
              <li className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-chart-8-active" />{t("dash.legendSoon")}</li>
              <li className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-accent-500" />{t("dash.legendLater")}</li>
            </ul>
          </div>
          {d.receivables.length === 0 ? (
            <div className="grid place-items-center gap-3 rounded-2xl bg-background-secondary-default px-6 py-14 text-center">
              <p className="max-w-sm text-body-regular text-text-secondary">{t("dash.emptyTimeline")}</p>
              <WriteOnly>
                <ButtonLink href="/factures/nouvelle" variant="secondary">
                  {t("invoices.new")}
                </ButtonLink>
              </WriteOnly>
            </div>
          ) : (
            <Echeancier receivables={d.receivables} today={today} />
          )}
        </Card>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 wide:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <RecentInvoices items={d.recentInvoices} />
          <div className="grid grid-cols-[minmax(0,1fr)] content-start gap-4">
            <TopCustomers items={d.topCustomers} />
            <RecentPayments items={d.recentPayments} />
          </div>
        </div>
      </div>

      <WriteOnly>
        <MobileActionBar>
          <ButtonLink href="/factures/nouvelle" leadingIcon={RiAddLine}>
            {t("invoices.new")}
          </ButtonLink>
        </MobileActionBar>
      </WriteOnly>
    </div>
  );
}
