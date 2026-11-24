import { RiLockLine } from "@remixicon/react";
import { ButtonLink } from "@/components/base/buttons/button";
import { getT } from "@/lib/locale";

export default async function ClosedPage() {
  const { t } = await getT();
  return (
    <div className="flex flex-col items-start gap-4">
      <span className="grid size-10 place-items-center rounded-full bg-background-secondary-default text-foreground-icon-secondary">
        <RiLockLine className="size-5" aria-hidden />
      </span>
      <h1 className="text-title-1-medium text-text-primary">{t("auth.closedTitle")}</h1>
      <p className="text-body-regular text-text-secondary">{t("auth.closedBody")}</p>
      <ButtonLink href="/connexion" variant="secondary">{t("auth.closedBack")}</ButtonLink>
    </div>
  );
}
