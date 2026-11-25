"use client";

import { useState, type ComponentType, type ReactNode } from "react";
import Link from "next/link";
import { RiCloseLine, RiSearchLine, RiSettings4Line, RiSideBarFill } from "@remixicon/react";
import type { Me } from "@facture/core";
import { BrandMark } from "@/components/ui/brand";
import { Kbd } from "@/components/base/kbd/kbd";
import { useI18n } from "@/lib/i18n-client";
import { cx } from "@/utils/cx";
import { DashboardAccountMenu } from "./dashboard-account-menu";

/**
 * BoardUI's floating dashboard sidebar (Figma: dashboard 1 → Sidebar), composed
 * for Tabaa: wordmark and collapse control on top, Quick Search, primary nav
 * with counters, then Settings and the account card at the bottom.
 */

type IconComponent = ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;

export interface DashboardNavItem {
  key: string;
  label: string;
  icon: IconComponent;
  href: string;
  badge?: ReactNode;
}

function Collapsible({ collapsed, children, className }: { collapsed: boolean; children: ReactNode; className?: string }) {
  return (
    <span
      className={cx(
        "flex min-w-0 items-center overflow-hidden transition-[max-width,opacity,filter] duration-300 ease-in-out",
        collapsed ? "max-w-0 opacity-0 blur-[3px]" : "max-w-full opacity-100 blur-0",
        className,
      )}
    >
      {children}
    </span>
  );
}

function NavItem({
  icon: Icon,
  label,
  badge,
  isSelected = false,
  collapsed = false,
  href,
  onNavigate,
}: {
  icon: IconComponent;
  label: string;
  badge?: ReactNode;
  isSelected?: boolean;
  collapsed?: boolean;
  href: string;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={isSelected ? "page" : undefined}
      aria-label={label}
      title={collapsed ? label : undefined}
      className={cx(
        "flex items-center justify-between overflow-hidden rounded-2lg p-2 outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring",
        "transition-[width,background-color] duration-300 ease-in-out",
        collapsed ? "w-9" : "w-full",
        isSelected ? "bg-linear-to-b from-accent-500 to-accent-600 shadow-nav-selected" : "hover:bg-background-secondary-hover",
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        <Icon className={cx("size-5 shrink-0", isSelected ? "text-white" : "text-foreground-icon-secondary")} aria-hidden />
        <Collapsible collapsed={collapsed}>
          <span className={cx("text-body-medium whitespace-nowrap", isSelected ? "text-white" : "text-text-secondary")}>{label}</span>
        </Collapsible>
      </span>
      {badge && <Collapsible collapsed={collapsed} className="gap-1">{badge}</Collapsible>}
    </Link>
  );
}

export function DashboardSidebar({
  items,
  selected,
  settingsSelected,
  me,
  onSearch,
  mobile = false,
  onClose,
  className,
}: {
  items: DashboardNavItem[];
  selected: string;
  settingsSelected: boolean;
  me: Me;
  onSearch: () => void;
  /** Rendered inside the mobile drawer: always expanded, close button instead of collapse. */
  mobile?: boolean;
  onClose?: () => void;
  className?: string;
}) {
  const { t } = useI18n();
  const [collapsedState, setCollapsed] = useState(false);
  const collapsed = mobile ? false : collapsedState;

  return (
    <aside
      className={cx(
        "flex h-full shrink-0 flex-col justify-between overflow-hidden rounded-3xl border border-border-button-white bg-background-secondary-default shadow-sidebar",
        "transition-[width] duration-300 ease-in-out",
        collapsed ? "w-[60px] px-[11px] py-3" : "w-[260px] p-3",
        className,
      )}
    >
      <div className="-m-2 flex min-h-0 w-[calc(100%+16px)] flex-col gap-3 overflow-y-auto p-2 [scrollbar-width:none]">
        <div className={cx("flex w-full transition-[gap] duration-300 ease-in-out", collapsed ? "flex-col-reverse items-start justify-center gap-2.5" : "flex-row items-center justify-between")}>
          <Link href="/" onClick={onClose} className="flex min-w-0 items-center gap-2.5 rounded-lg px-1 outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring">
            <BrandMark size={collapsed ? 28 : 30} />
            <Collapsible collapsed={collapsed}>
              <span className="brand-word text-[22px] leading-none text-text-primary">{t("brand.name")}</span>
            </Collapsible>
          </Link>
          {mobile ? (
            <button type="button" aria-label={t("common.close")} onClick={onClose} className="cursor-pointer text-foreground-icon-secondary">
              <RiCloseLine className="size-5" aria-hidden />
            </button>
          ) : (
            <button
              type="button"
              aria-label={collapsed ? t("nav.expand") : t("nav.collapse")}
              aria-expanded={!collapsed}
              onClick={() => setCollapsed(!collapsedState)}
              className={cx("cursor-pointer text-foreground-icon-secondary", collapsed && "flex w-9 items-center justify-center")}
            >
              <RiSideBarFill className={cx("size-5 transition-transform duration-300 ease-in-out", collapsed ? "rtl:-scale-x-100" : "-scale-x-100 rtl:scale-x-100")} aria-hidden />
            </button>
          )}
        </div>

        <div className="flex w-full flex-col gap-3">
          <button
            type="button"
            aria-label={t("palette.quick")}
            title={collapsed ? t("palette.quick") : undefined}
            onClick={() => {
              onClose?.();
              onSearch();
            }}
            className={cx(
              "flex cursor-pointer items-center gap-2 p-2 outline-none hover:bg-background-tertiary-hover/55 focus-visible:ring-2 focus-visible:ring-border-focus-ring",
              "transition-[width,border-radius,background-color] duration-300 ease-in-out",
              collapsed ? "w-9 rounded-full bg-background-tertiary-default" : "w-full rounded-full bg-background-tertiary-default",
            )}
          >
            <span className={cx("flex min-w-0 items-center gap-2", !collapsed && "flex-1")}>
              <RiSearchLine className="size-5 shrink-0 text-foreground-icon-secondary" aria-hidden />
              <Collapsible collapsed={collapsed}>
                <span className="text-body-medium whitespace-nowrap text-text-secondary">{t("palette.quick")}</span>
              </Collapsible>
            </span>
            <Collapsible collapsed={collapsed}>
              <Kbd dir="ltr" className="max-nav:hidden">⌘K</Kbd>
            </Collapsible>
          </button>

          <nav aria-label={t("nav.label")} className={cx("flex w-full flex-col gap-1", !collapsed && "px-0.5")}>
            {items.map((item) => (
              <NavItem key={item.key} icon={item.icon} label={item.label} href={item.href} badge={item.badge} isSelected={selected === item.key} collapsed={collapsed} onNavigate={onClose} />
            ))}
          </nav>
        </div>
      </div>

      <div className="flex w-full shrink-0 flex-col gap-3">
        <nav className="flex w-full flex-col gap-1">
          <NavItem icon={RiSettings4Line} label={t("nav.settings")} href="/parametres" isSelected={settingsSelected} collapsed={collapsed} onNavigate={onClose} />
        </nav>
        <DashboardAccountMenu me={me} collapsed={collapsed} />
      </div>
    </aside>
  );
}
