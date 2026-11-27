"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { RiBox3Line, RiFileList3Line, RiGroupLine, RiHome5Line, RiMenuLine } from "@remixicon/react";
import { DashboardSidebar, type DashboardNavItem } from "@/components/application/dashboard/dashboard-sidebar";
import { Counter } from "@/components/base/badges/counter";
import { Breadcrumb, BreadcrumbItem } from "@/components/base/breadcrumb/breadcrumb";
import { IconButton } from "@/components/base/buttons/icon-button";
import { Drawer } from "@/components/base/drawer/drawer";
import type { Me } from "@facture/core";
import { useI18n } from "@/lib/i18n-client";
import { cx } from "@/utils/cx";
import type { Key } from "@/lib/i18n";
import { BrandMark } from "./ui/brand";
import { CommandPaletteHost, usePaletteTrigger } from "./command-palette";


const CrumbCtx = createContext<{ label: string | null; set: (l: string | null) => void }>({ label: null, set: () => {} });

export function CrumbLabel({ children }: { children: string }) {
  const { set } = useContext(CrumbCtx);
  useEffect(() => {
    set(children);
    return () => set(null);
  }, [children, set]);
  return null;
}

export function TopbarActions({ children }: { children: React.ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => setTarget(document.getElementById("topbar-actions")), []);
  return target ? createPortal(children, target) : null;
}

const SEGMENTS: Record<string, Key> = {
  factures: "nav.invoices",
  clients: "nav.customers",
  articles: "nav.items",
  parametres: "nav.settings",
  compte: "settings.account",
  securite: "settings.security",
  equipe: "settings.team",
  entreprise: "settings.company",
  facturation: "settings.invoicing",
  preferences: "settings.preferences",
  nouvelle: "crumb.new",
  modifier: "crumb.edit",
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-/;

function Topbar() {
  const { t } = useI18n();
  const pathname = usePathname();
  const { label } = useContext(CrumbCtx);
  const parts = pathname.split("/").filter(Boolean);
  const crumbs: { href: string; text: string }[] = [];
  parts.forEach((p, i) => {
    const href = "/" + parts.slice(0, i + 1).join("/");
    if (UUID.test(p)) crumbs.push({ href, text: label ?? "…" });
    else if (SEGMENTS[p]) crumbs.push({ href, text: t(SEGMENTS[p]) });
  });
  const showOnPhone = crumbs.length >= 2 && parts[0] !== "parametres";
  return (
    <div className={cx("min-h-14 flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2.5 sm:px-6 nav:flex nav:px-8", showOnPhone ? "flex" : "hidden")}>
      <Breadcrumb aria-label={t("nav.breadcrumb")} className="w-full min-w-0 nav:w-auto nav:flex-1">
        <BreadcrumbItem icon={RiHome5Line} href="/" current={parts.length === 0}>
          <span className={parts.length ? "sr-only" : undefined}>{t("nav.dashboard")}</span>
        </BreadcrumbItem>
        {crumbs.map((c, i) => (
          <BreadcrumbItem key={c.href} href={c.href} current={i === crumbs.length - 1}>
            {c.text}
          </BreadcrumbItem>
        ))}
      </Breadcrumb>
      <div id="topbar-actions" className="hidden flex-wrap items-center gap-2 nav:flex" />
    </div>
  );
}

function Navigation({ me, drafts, overdue, mobile, onClose }: { me: Me; drafts: number; overdue: number; mobile?: boolean; onClose?: () => void }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const openPalette = usePaletteTrigger();
  const items: DashboardNavItem[] = [
    { key: "dashboard", label: t("nav.dashboard"), icon: RiHome5Line, href: "/" },
    {
      key: "invoices",
      label: t("nav.invoices"),
      icon: RiFileList3Line,
      href: "/factures",
      badge: (
        <>
          {overdue > 0 && <Counter color="danger" title={t("dash.overdue")}>{overdue}</Counter>}
          {drafts > 0 && <Counter color="neutral" title={t("invoices.tab.drafts")}>{drafts}</Counter>}
        </>
      ),
    },
    { key: "customers", label: t("nav.customers"), icon: RiGroupLine, href: "/clients" },
    { key: "items", label: t("nav.items"), icon: RiBox3Line, href: "/articles" },
  ];
  const selected =
    items.find((i) => (i.href === "/" ? pathname === "/" : pathname === i.href || pathname.startsWith(`${i.href}/`)))?.key ?? "";
  return (
    <DashboardSidebar
      items={items}
      selected={selected}
      settingsSelected={pathname.startsWith("/parametres")}
      me={me}
      onSearch={openPalette}
      mobile={mobile}
      onClose={onClose}
      className={mobile ? "w-full" : undefined}
    />
  );
}

export function Frame({ me, drafts, overdue, children }: { me: Me; drafts: number; overdue: number; children: React.ReactNode }) {
  const { t } = useI18n();
  const [label, setLabel] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setLabel(null), [pathname]);

  return (
    <CommandPaletteHost>
      <CrumbCtx value={{ label, set: setLabel }}>
        <div className="min-h-dvh bg-background-full nav:flex">
          <div className="sticky top-0 hidden h-dvh shrink-0 p-3 nav:block">
            <Navigation me={me} drafts={drafts} overdue={overdue} />
          </div>

          <div className="min-w-0 flex-1">
            <header className="flex h-14 items-center justify-between gap-3 px-4 sm:px-6 nav:hidden">
              <span className="flex items-center gap-2.5">
                <BrandMark size={28} />
                <span className="brand-word text-[21px] leading-none text-text-primary">{t("brand.name")}</span>
              </span>
              <IconButton icon={RiMenuLine} aria-label={t("nav.menu")} onClick={() => setMenuOpen(true)} />
              <Drawer isOpen={menuOpen} onOpenChange={setMenuOpen} placement="start" size="sm" aria-label={t("nav.menu")} className="rounded-3xl border-0 bg-transparent py-0 shadow-none">
                <Navigation me={me} drafts={drafts} overdue={overdue} mobile onClose={() => setMenuOpen(false)} />
              </Drawer>
            </header>
            <Topbar />
            <main className="mx-auto max-w-[1280px] px-4 pt-1 pb-28 sm:px-6 nav:px-8 nav:pt-2 nav:pb-16">
              {(me.role === "VIEWER" || me.role === "ACCOUNTANT") && (
                <p role="status" className="mb-4 rounded-xl bg-status-blue-background px-3 py-2.5 text-body-medium text-status-blue-text">
                  {t("role.readOnlyNote", { role: t(`role.${me.role}`) })}
                </p>
              )}
              {children}
            </main>
          </div>
        </div>
      </CrumbCtx>
    </CommandPaletteHost>
  );
}
