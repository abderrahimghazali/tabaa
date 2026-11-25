"use client";

import { useState, type ComponentType } from "react";
import { RiMoreFill } from "@remixicon/react";
import { Dropdown, DropdownGroup, DropdownItem, DropdownPopover, DropdownTrigger } from "@/components/base/dropdown/dropdown";
import { useI18n } from "@/lib/i18n-client";
import { cx } from "@/utils/cx";

export type MoreItem = {
  key: string;
  label: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;
  onSelect: () => void;
};

/** Phone-only action bar: the page's one primary action at full width, secondary actions behind a labelled "Plus" menu. */
export function MobileActionBar({ children, more }: { children?: React.ReactNode; more?: MoreItem[] }) {
  const { t } = useI18n();
  const items = more ?? [];
  const [open, setOpen] = useState(false);
  return (
    <div className="nav:hidden">
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border-button-default bg-background-primary-default px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-[640px] items-center gap-2">
          <div className={cx("flex min-w-0 flex-1 [&>*]:flex-1", !children && "hidden")}>{children}</div>
          {items.length > 0 && (
            <Dropdown isOpen={open} onOpenChange={setOpen}>
              <DropdownTrigger
                aria-label={t("mob.moreActions")}
                className={cx(
                  "inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-2lg px-3.5",
                  "border border-border-button-default bg-background-primary-default text-body-medium text-text-primary shadow-xs",
                  "transition-colors hover:bg-background-primary-hover",
                  !children && "flex-1",
                )}
              >
                <RiMoreFill className="size-5 text-foreground-icon-secondary" aria-hidden />
                {t("mob.more")}
              </DropdownTrigger>
              <DropdownPopover aria-label={t("mob.moreActions")} placement="top end" offset={10} variant="compact" className="w-[260px]">
                <DropdownGroup>
                  {items.map(({ key, label, icon: Icon, onSelect }) => (
                    <DropdownItem key={key} onSelect={() => { setOpen(false); onSelect(); }} className="min-h-11">
                      <span className="flex items-center gap-2.5">
                        <Icon className="size-[18px] shrink-0 text-foreground-icon-secondary" aria-hidden />
                        {label}
                      </span>
                    </DropdownItem>
                  ))}
                </DropdownGroup>
              </DropdownPopover>
            </Dropdown>
          )}
        </div>
      </div>
    </div>
  );
}
