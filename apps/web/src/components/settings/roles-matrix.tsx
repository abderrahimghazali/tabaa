"use client";

import { useState } from "react";
import { RiArrowDownSLine, RiCheckLine, RiSubtractLine } from "@remixicon/react";
import { useI18n } from "@/lib/i18n-client";
import { CAPABILITY_ROWS, ROLES, roleHas } from "@/lib/permissions";
import { cx } from "@/utils/cx";

/** Permission table: capabilities in rows, roles in columns. Collapsible on phones, always open from `nav`. */
export function RolesMatrix() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="roles-matrix"
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-11 w-full cursor-pointer items-center justify-between gap-2 rounded-xl text-start text-body-medium text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring nav:hidden"
      >
        {open ? t("team.rolesHide") : t("team.rolesShow")}
        <RiArrowDownSLine className={cx("size-5 text-foreground-icon-secondary transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      <div id="roles-matrix" className={cx("overflow-x-auto", !open && "max-nav:hidden")}>
        <table className="w-full min-w-[620px] border-separate border-spacing-0 text-body-regular">
          <caption className="sr-only">{t("team.rolesTitle")}</caption>
          <thead>
            <tr>
              <th scope="col" className="sticky start-0 z-10 bg-background-primary-default py-2 pe-3 text-start text-caption-1-medium text-text-secondary" />
              {ROLES.map((r) => (
                <th key={r} scope="col" className="px-2 py-2 text-center text-caption-1-medium text-text-secondary">{t(`role.${r}`)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CAPABILITY_ROWS.map((row) => (
              <tr key={row}>
                <th scope="row" className="sticky start-0 z-10 border-t border-separator-border bg-background-primary-default py-2.5 pe-3 text-start text-body-regular font-normal text-text-primary">
                  {t(`cap.${row}`)}
                  {row === "team" && <span className="text-text-tertiary"> ({t("cap.teamAdmin")})</span>}
                </th>
                {ROLES.map((r) => {
                  const yes = roleHas(r, row);
                  return (
                    <td key={r} className="border-t border-separator-border px-2 py-2.5 text-center">
                      {yes ? (
                        <RiCheckLine className="mx-auto size-5 text-accent-600" aria-hidden />
                      ) : (
                        <RiSubtractLine className="mx-auto size-5 text-foreground-icon-tertiary" aria-hidden />
                      )}
                      <span className="sr-only">{yes ? t("cap.yes") : t("cap.no")}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
