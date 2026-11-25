"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { RiArrowRightLine } from "@remixicon/react";
import type { Dashboard } from "@facture/core";
import { NameAvatar } from "@/components/app/name-avatar";
import { Card } from "@/components/app/layout";
import { Money } from "@/components/app/money";
import { Chip } from "@/components/base/badges/chip";
import { ProgressBar } from "@/components/base/progress/progress";
import { Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from "@/components/base/table/table";
import { StatusChip } from "@/components/invoice/status";
import { fmtDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n-client";

function CardHead({ title, href }: { title: string; href?: string }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-3">
      <h3 className="text-headline-medium text-text-primary">{title}</h3>
      {href && (
        <Link href={href} className="inline-flex items-center gap-1 rounded-md text-body-medium text-accent-600 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-border-focus-ring">
          {t("common.seeAll")}
          <RiArrowRightLine className="size-4 rtl:rotate-180" aria-hidden />
        </Link>
      )}
    </div>
  );
}

export function RecentInvoices({ items }: { items: Dashboard["recentInvoices"] }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  return (
    <Card className="self-start overflow-hidden">
      <CardHead title={t("dash.recentInvoices")} href="/factures" />
      {items.length === 0 ? (
        <p className="px-5 pt-4 pb-8 text-center text-body-regular text-text-secondary">{t("dash.noInvoices")}</p>
      ) : (
        <Table aria-label={t("dash.recentInvoices")} size="sm" onRowAction={(key) => router.push(`/factures/${key}`)}>
          <TableHeader>
            <TableColumn isRowHeader>{t("col.customer")}</TableColumn>
            <TableColumn className="max-sm:hidden">{t("col.status")}</TableColumn>
            <TableColumn className="text-end">{t("col.gross")}</TableColumn>
          </TableHeader>
          <TableBody>
            {items.map((inv) => (
              <TableRow key={inv.id} id={inv.id} aria-label={`${t("dash.openInvoice")} ${inv.number ?? ""}`} className="cursor-pointer hover:bg-background-secondary-default">
                <TableCell>
                  <div className="flex items-center gap-2.5">
                    <NameAvatar name={inv.customerName} size="sm" />
                    <div className="min-w-0">
                      <div className="truncate text-body-medium text-text-primary">{inv.customerName}</div>
                      <div className="text-caption-1-medium text-text-tertiary">
                        <span className="ident">{inv.number ?? t("invoices.noNumber")}</span> · <span className="num">{fmtDate(inv.issueDate)}</span>
                      </div>
                      <div className="mt-1 sm:hidden">
                        <StatusChip inv={inv} t={t} />
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="max-sm:hidden">
                  <StatusChip inv={inv} t={t} />
                </TableCell>
                <TableCell className="text-end">
                  <Chip variant="subtle" color="gray">
                    <Money value={inv.totalGross} locale={locale} bare />
                  </Chip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}

export function TopCustomers({ items }: { items: Dashboard["topCustomers"] }) {
  const { t, locale } = useI18n();
  const max = Math.max(1, ...items.map((c) => Number(c.invoiced)));
  return (
    <Card>
      <CardHead title={t("dash.topCustomers")} href="/clients" />
      {items.length === 0 ? (
        <p className="px-5 pt-4 pb-8 text-center text-body-regular text-text-secondary">{t("dash.noCustomers")}</p>
      ) : (
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-1 px-2 pb-2">
          {items.map((c) => (
            <li key={c.customerId}>
              <Link href={`/clients/${c.customerId}`} className="block rounded-xl px-3 py-2.5 outline-none transition-colors hover:bg-background-secondary-default focus-visible:ring-2 focus-visible:ring-border-focus-ring">
                <div className="flex items-center gap-3">
                  <NameAvatar name={c.name} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-body-medium text-text-primary">{c.name}</span>
                  <Money value={c.invoiced} locale={locale} bare className="text-body-medium text-text-primary" />
                </div>
                <div className="mt-2 flex items-center gap-3 ps-9">
                  <span className="min-w-0 flex-1">
                    <ProgressBar aria-label={c.name} value={(Number(c.invoiced) / max) * 100} size="sm" />
                  </span>
                  {Number(c.outstanding) > 0 ? (
                    <Chip variant="caption" color="yellow" className="gap-1">
                      {t("dash.owes")} <Money value={c.outstanding} locale={locale} bare />
                    </Chip>
                  ) : (
                    <Chip variant="caption" color="lime">{t("dash.settled")}</Chip>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function RecentPayments({ items }: { items: Dashboard["recentPayments"] }) {
  const { t, locale } = useI18n();
  return (
    <Card>
      <CardHead title={t("dash.recentPayments")} />
      {items.length === 0 ? (
        <p className="px-5 pt-2 pb-8 text-center text-body-regular text-text-secondary">{t("dash.noPayments")}</p>
      ) : (
        <ul className="px-2 pb-2">
          {items.slice(0, 4).map((p) => (
            <li key={p.id}>
              <Link href={`/factures/${p.invoiceId}`} className="flex items-center gap-3 rounded-xl px-3 py-2.5 outline-none transition-colors hover:bg-background-secondary-default focus-visible:ring-2 focus-visible:ring-border-focus-ring">
                <NameAvatar name={p.customerName} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body-medium text-text-primary">{p.customerName}</span>
                  <span className="num block text-caption-1-medium text-text-tertiary">{fmtDate(p.paidOn)}</span>
                </span>
                <Chip variant="caption" color="lime">
                  <Money value={p.amount} locale={locale} bare />
                </Chip>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
