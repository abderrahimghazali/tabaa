"use client";

import { useState, useTransition } from "react";
import { RiDownload2Line, RiLogoutBoxRLine } from "@remixicon/react";
import type { AuditEvent } from "@facture/core";
import { Button, ButtonLink } from "@/components/base/buttons/button";
import { AlertDialog, ModalTrigger } from "@/components/base/modal/modal";
import { Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from "@/components/base/table/table";
import { toast } from "@/components/base/toast/toast";
import { loadAuditEvents } from "@/lib/actions";
import { signOutAll } from "@/lib/auth-actions";
import { useI18n } from "@/lib/i18n-client";
import type { Key } from "@/lib/i18n";
import { MfaSection } from "./mfa-section";
import { Section } from "./section";

const PAGE = 25;

function when(iso: string, locale: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function SecurityPanel({
  role,
  initialEvents,
  auditFailed,
}: {
  role: string;
  initialEvents: AuditEvent[];
  auditFailed?: boolean;
}) {
  const { t, locale } = useI18n();
  const [events, setEvents] = useState(initialEvents);
  const [more, setMore] = useState(initialEvents.length >= PAGE);
  const [pending, start] = useTransition();
  const admin = role === "OWNER" || role === "ADMIN";

  const label = (code: string) => {
    const key = `audit.${code}` as Key;
    try {
      const text = t(key);
      return text === undefined ? t("audit.unknown", { code }) : text;
    } catch {
      return t("audit.unknown", { code });
    }
  };

  const loadMore = () =>
    start(async () => {
      const before = events.at(-1)?.at;
      const res = await loadAuditEvents(before);
      if (!res.ok) {
        toast.error(t("security.auditError"));
        return;
      }
      setEvents((all) => [...all, ...res.data]);
      setMore(res.data.length >= PAGE);
    });

  return (
    <div className="grid max-w-5xl gap-4">
      <Section title={t("security.sessionsTitle")} description={t("security.sessionsPolicy")}>
        <div className="flex flex-col items-start gap-2 sm:col-span-2">
          <p className="text-body-regular text-text-secondary">{t("security.signOutAllHint")}</p>
          <ModalTrigger>
            <Button variant="secondary" leadingIcon={RiLogoutBoxRLine}>{t("security.signOutAll")}</Button>
            <AlertDialog
              title={t("security.signOutAllTitle")}
              description={t("security.signOutAllBody")}
              confirmLabel={t("security.signOutAll")}
              cancelLabel={t("common.cancel")}
              pendingLabel={t("auth.pending")}
              onConfirm={() => signOutAll()}
            />
          </ModalTrigger>
        </div>
      </Section>

      <MfaSection />

      {role === "OWNER" && (
        <Section title={t("security.exportTitle")} description={t("security.exportBody")}>
          <div className="sm:col-span-2">
            <ButtonLink variant="secondary" href="/parametres/securite/export" download leadingIcon={RiDownload2Line}>
              {t("security.exportButton")}
            </ButtonLink>
          </div>
        </Section>
      )}

      {admin && (
        <Section title={t("security.auditTitle")} description={t("security.auditBody")}>
          <div className="sm:col-span-2">
            {auditFailed ? (
              <p className="text-body-regular text-text-secondary">{t("security.auditError")}</p>
            ) : events.length === 0 ? (
              <p className="text-body-regular text-text-secondary">{t("security.auditEmpty")}</p>
            ) : (
              <>
                <Table aria-label={t("security.table")} selectionMode="none" size="sm" className="min-w-[720px]">
                  <TableHeader>
                    <TableColumn id="when" isRowHeader>{t("security.col.when")}</TableColumn>
                    <TableColumn id="user">{t("security.col.user")}</TableColumn>
                    <TableColumn id="action">{t("security.col.action")}</TableColumn>
                    <TableColumn id="object">{t("security.col.object")}</TableColumn>
                    <TableColumn id="ip">{t("security.col.ip")}</TableColumn>
                  </TableHeader>
                  <TableBody>
                    {events.map((e) => (
                      <TableRow key={e.id} id={e.id}>
                        <TableCell className="num whitespace-nowrap">{when(e.at, locale)}</TableCell>
                        <TableCell>{e.actorName ?? t("security.noUser")}</TableCell>
                        <TableCell className="whitespace-nowrap">{label(e.action)}</TableCell>
                        <TableCell className="max-w-[260px] truncate">{e.summary ?? e.entityType ?? "—"}</TableCell>
                        <TableCell className="ident text-caption-1-regular">{e.ip ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {more && (
                  <div className="mt-4 flex justify-center">
                    <Button variant="secondary" onClick={loadMore} aria-busy={pending}>{t("security.auditLoadMore")}</Button>
                  </div>
                )}
              </>
            )}
          </div>
        </Section>
      )}
    </div>
  );
}
