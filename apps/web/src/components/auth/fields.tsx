"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { RiEyeLine, RiEyeOffLine } from "@remixicon/react";
import type { ApiError } from "@facture/core";
import { Button } from "@/components/base/buttons/button";
import { Input, type InputProps } from "@/components/base/input/input";
import { BrandLoader } from "@/components/ui/brand";
import { useI18n } from "@/lib/i18n-client";
import type { Key } from "@/lib/i18n";
import { cx } from "@/utils/cx";

const Visible = createContext<{ visible: boolean; toggle: () => void }>({ visible: false, toggle: () => {} });

function EyeToggle() {
  const { t } = useI18n();
  const { visible, toggle } = useContext(Visible);
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={visible ? t("auth.hidePassword") : t("auth.showPassword")}
      aria-pressed={visible}
      className="-me-1 grid size-6 shrink-0 cursor-pointer place-items-center rounded-md text-foreground-icon-secondary outline-none hover:text-foreground-icon-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring"
    >
      {visible ? <RiEyeOffLine className="size-5" aria-hidden /> : <RiEyeLine className="size-5" aria-hidden />}
    </button>
  );
}

export function PasswordField({ errorMessage, ...props }: Omit<InputProps, "type" | "trailingAddon"> & { errorMessage?: ReactNode }) {
  const [visible, setVisible] = useState(false);
  return (
    <Visible value={{ visible, toggle: () => setVisible((v) => !v) }}>
      <Input
        {...props}
        type={visible ? "text" : "password"}
        inputDir="ltr"
        isInvalid={!!errorMessage}
        errorMessage={errorMessage}
        trailingAddon={<EyeToggle />}
      />
    </Visible>
  );
}

export function Notice({ tone, children }: { tone: "info" | "success" | "error"; children: ReactNode }) {
  const toneClass = {
    info: "bg-status-blue-background text-status-blue-text",
    success: "bg-status-lime-background text-status-lime-text",
    error: "bg-status-rose-background text-status-rose-text",
  }[tone];
  return (
    <p role={tone === "error" ? "alert" : "status"} className={cx("rounded-xl px-3 py-2.5 text-body-medium", toneClass)}>
      {children}
    </p>
  );
}

export function SubmitButton({ pending, children }: { pending: boolean; children: ReactNode }) {
  const { t } = useI18n();
  return (
    <Button type="submit" className="w-full" aria-busy={pending}>
      {pending ? <BrandLoader size={22} inverse label={t("auth.pending")} className="flex-row" /> : children}
    </Button>
  );
}

export function AuthHeading({ title, sub }: { title: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-1.5">
      <h1 className="text-title-1-medium text-text-primary">{title}</h1>
      {sub && <p className="text-body-regular text-text-secondary">{sub}</p>}
    </div>
  );
}

/** Focus the first invalid field after a failed submit. */
export function useFocusFirstInvalid(deps: unknown[]) {
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return form;
}

/** Map an API error to a field-level or form-level message. */
export function fieldIssue(error: ApiError | null, path: string): string | undefined {
  return error?.issues?.find((i) => i.path === path)?.message;
}

export const errorKey = (code: string): Key | null =>
  (({
    INVALID_CREDENTIALS: "auth.err.invalidCredentials",
    TOO_MANY_ATTEMPTS: "auth.err.tooMany",
    INVALID_TOKEN: "auth.err.invalidToken",
    UNREACHABLE: "auth.err.unavailable",
  }) as Record<string, Key>)[code] ?? null;
