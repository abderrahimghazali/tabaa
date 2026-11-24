import { RiHome5Line } from "@remixicon/react";
import { ButtonLink } from "@/components/base/buttons/button";
import { getT } from "@/lib/locale";

export default async function NotFound() {
  const { t } = await getT();
  return (
    <div className="mx-auto mt-16 flex max-w-md flex-col items-center text-center">
      <h1 className="text-title-2-medium text-text-primary">{t("notFound.title")}</h1>
      <p className="mt-2 text-body-regular text-text-secondary">{t("notFound.body")}</p>
      <ButtonLink href="/" className="mt-6" leadingIcon={RiHome5Line}>
        {t("nav.dashboard")}
      </ButtonLink>
    </div>
  );
}
