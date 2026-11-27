"use client";

import { useState, useSyncExternalStore, type ComponentType, type ReactNode } from "react";
import Link from "next/link";
import { RiBuilding2Line, RiCheckLine, RiTeamLine, RiEqualizer3Line, RiLogoutBoxRLine, RiUserLine } from "@remixicon/react";
import type { Me } from "@facture/core";
import {
  Button as AriaButton,
  Dialog as AriaDialog,
  DialogTrigger as AriaDialogTrigger,
  Popover as AriaPopover,
} from "react-aria-components";
import { Avatar } from "@/components/base/avatar/avatar";
import { ChevronDownSmall } from "@/components/foundations/icons/chevrons";
import { useDirection } from "@/components/foundations/direction/direction";
import { setLocale } from "@/lib/actions";
import { signOut, switchWorkspace } from "@/lib/auth-actions";
import { toast } from "@/components/base/toast/toast";
import type { Locale } from "@/lib/format";
import { useI18n } from "@/lib/i18n-client";
import { cx } from "@/utils/cx";

type IconComponent = ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;

const rowClass =
  "flex w-full cursor-pointer items-center gap-2.5 rounded-2lg p-2 text-start outline-none transition-colors hover:bg-background-primary-hover focus-visible:bg-background-primary-hover";

function MenuLink({ href, icon: Icon, onSelect, children }: { href: string; icon: IconComponent; onSelect: () => void; children: ReactNode }) {
  return (
    <Link href={href} onClick={onSelect} className={rowClass}>
      <Icon className="size-5 shrink-0 text-foreground-icon-secondary" aria-hidden />
      <span className="truncate text-body-medium text-text-primary">{children}</span>
    </Link>
  );
}

const mobileSnapshot = () => window.matchMedia("(max-width: 639px)").matches;
const subscribeMobile = (listener: () => void) => {
  const query = window.matchMedia("(max-width: 639px)");
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
};

export function DashboardAccountMenu({
  me,
  collapsed = false,
  className,
}: {
  me: Me;
  collapsed?: boolean;
  className?: string;
}) {
  const { t, locale } = useI18n();
  const direction = useDirection();
  const [isOpen, setIsOpen] = useState(false);
  const isMobile = useSyncExternalStore(subscribeMobile, mobileSnapshot, () => false);
  const name = me.user.name;
  const initials = name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const close = () => setIsOpen(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const many = me.memberships.length > 1;

  const switchTo = async (tenantId: string) => {
    if (switching) return;
    if (tenantId === me.tenant.id) return close();
    setSwitching(tenantId);
    const res = await switchWorkspace(tenantId);
    if (!res.ok) {
      setSwitching(null);
      toast.error(t("ws.switchFailed"));
      return;
    }
    // A full load, not a client navigation: nothing from the previous workspace may survive in memory.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/");
  };

  const pick = (next: Locale) => {
    if (next === locale) return;
    document.documentElement.lang = next;
    document.documentElement.dir = next === "ar" ? "rtl" : "ltr";
    void setLocale(next);
    close();
  };

  const identity = (
    <>
      <Avatar size="md" color="blue" initials={initials} />
      <span className="flex min-w-0 flex-col items-start justify-center">
        <span dir="auto" className="max-w-full truncate text-body-medium text-text-primary">{name}</span>
        <span className="max-w-full truncate text-caption-1-medium text-text-secondary">{me.tenant.name}</span>
      </span>
    </>
  );

  return (
    <AriaDialogTrigger isOpen={isOpen} onOpenChange={setIsOpen}>
      <AriaButton
        aria-label={t("account.menu")}
        className={cx(
          "flex cursor-pointer items-center overflow-hidden outline-none",
          "border-2 border-transparent hover:border-border-button-hover",
          "transition-[width,background-color,border-color,padding] duration-300 ease-in-out",
          "focus-visible:ring-2 focus-visible:ring-border-focus-ring focus-visible:ring-offset-2",
          collapsed
            ? "size-9 justify-start rounded-full bg-transparent p-0"
            : "w-full justify-between rounded-xl bg-background-tertiary-default py-2 pe-3 ps-2.5",
          className,
        )}
      >
        {collapsed ? (
          <Avatar size="md" color="blue" initials={initials} />
        ) : (
          <>
            <span className="flex min-w-0 items-center gap-2">{identity}</span>
            <span className="flex size-4 shrink-0 items-center justify-center rounded-[3px] bg-background-tertiary-hover">
              <ChevronDownSmall className={cx("size-4 text-text-secondary transition-transform duration-200 ease", isOpen && "rotate-180")} />
            </span>
          </>
        )}
      </AriaButton>

      <AriaPopover
        placement={isMobile ? "top start" : direction === "rtl" ? "left bottom" : "right bottom"}
        offset={8}
        className={cx(
          "w-[265px] max-w-[calc(100vw-32px)] origin-bottom-left overflow-y-auto",
          "rounded-2xl border border-border-button-default bg-background-primary-default p-2.5 shadow-dropdown",
          "transition duration-150 ease-out",
          "data-[entering]:opacity-0 data-[entering]:scale-95 data-[entering]:blur-[2px]",
          "data-[exiting]:opacity-0 data-[exiting]:scale-95 data-[exiting]:blur-[2px]",
        )}
      >
        <AriaDialog aria-label={t("account.menu")} className="flex flex-col gap-1.5 outline-none">
          <div className="flex w-full items-center gap-2 px-2 pt-1 pb-1">{identity}</div>
          {many && (
            <>
              <div className="-mx-2.5 my-1 h-px bg-border-button-default" />
              <span className="px-2 text-body-medium text-text-secondary">{t("ws.switch")}</span>
              <ul className="flex flex-col gap-0.5" aria-label={t("ws.switch")}>
                {me.memberships.map((m) => {
                  const active = m.tenantId === me.tenant.id;
                  return (
                    <li key={m.tenantId}>
                      <AriaButton
                        onPress={() => void switchTo(m.tenantId)}
                        isDisabled={!!switching}
                        aria-current={active ? "true" : undefined}
                        className={cx(rowClass, "justify-between", switching && !active && switching !== m.tenantId && "opacity-60")}
                      >
                        <span className="flex min-w-0 items-center gap-2.5">
                          <RiTeamLine className="size-5 shrink-0 text-foreground-icon-secondary" aria-hidden />
                          <span className="flex min-w-0 flex-col">
                            <span dir="auto" className="truncate text-body-medium text-text-primary">{m.tenantName}</span>
                            <span className="truncate text-caption-1-regular text-text-secondary">{t(`role.${m.role}`)}</span>
                          </span>
                        </span>
                        {active && <RiCheckLine className="size-5 shrink-0 text-accent-600" aria-hidden />}
                        {switching === m.tenantId && <span role="status" className="sr-only">{t("auth.pending")}</span>}
                      </AriaButton>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          <div className="-mx-2.5 my-1 h-px bg-border-button-default" />
          <MenuLink href="/parametres/entreprise" icon={RiBuilding2Line} onSelect={close}>{t("company.settings")}</MenuLink>
          <MenuLink href="/parametres/compte" icon={RiUserLine} onSelect={close}>{t("settings.account")}</MenuLink>
          <MenuLink href="/parametres/preferences" icon={RiEqualizer3Line} onSelect={close}>{t("settings.preferences")}</MenuLink>
          <div className="-mx-2.5 my-1 h-px bg-border-button-default" />
          <span className="px-2 text-body-medium text-text-secondary">{t("nav.language")}</span>
          {(
            [
              ["fr", "Français", "fr"],
              ["ar", "العربية", "ar"],
            ] as const
          ).map(([key, label, lang]) => (
            <AriaButton key={key} onPress={() => pick(key)} aria-pressed={locale === key} className={cx(rowClass, "justify-between")}>
              <span lang={lang} className="text-body-medium text-text-primary">{label}</span>
              {locale === key && <RiCheckLine className="size-5 text-accent-600" aria-hidden />}
            </AriaButton>
          ))}
          <div className="-mx-2.5 my-1 h-px bg-border-button-default" />
          <AriaButton onPress={() => void signOut()} className={rowClass}>
            <RiLogoutBoxRLine className="size-5 shrink-0 text-foreground-icon-secondary rtl:-scale-x-100" aria-hidden />
            <span className="text-body-medium text-text-primary">{t("auth.signOut")}</span>
          </AriaButton>
        </AriaDialog>
      </AriaPopover>
    </AriaDialogTrigger>
  );
}
