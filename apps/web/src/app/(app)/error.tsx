"use client";

import { RiErrorWarningLine, RiRestartLine } from "@remixicon/react";
import { Button } from "@/components/base/buttons/button";
import { useT } from "@/lib/i18n-client";

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useT();
  return (
    <div className="mx-auto mt-16 flex max-w-md flex-col items-center text-center">
      <span className="grid size-12 place-items-center rounded-full bg-background-tertiary-error text-foreground-icon-error">
        <RiErrorWarningLine className="size-6" aria-hidden />
      </span>
      <h1 className="mt-4 text-title-2-medium text-text-primary">{t("error.title")}</h1>
      <p className="mt-2 text-body-regular text-text-secondary">{t("error.body")}</p>
      {error.digest && <p className="ident mt-2 text-caption-1-regular text-text-tertiary">{error.digest}</p>}
      <Button className="mt-6" leadingIcon={RiRestartLine} onClick={reset}>
        {t("common.retry")}
      </Button>
    </div>
  );
}
