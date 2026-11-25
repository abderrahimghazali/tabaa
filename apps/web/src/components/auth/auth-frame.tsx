import { BrandMark } from "@/components/ui/brand";
import { getT } from "@/lib/locale";
import { BrandPanel } from "./brand-panel";
import { LangSwitch } from "./lang-switch";

export async function AuthFrame({ children }: { children: React.ReactNode }) {
  const { t } = await getT();
  return (
    <div className="grid min-h-dvh gap-3 bg-background-full p-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:p-3">
      <div className="flex min-h-dvh flex-col px-5 py-5 sm:px-10 lg:min-h-0">
        <header className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2.5 lg:invisible">
            <BrandMark size={28} />
            <span className="brand-word text-[21px] leading-none text-text-primary">{t("brand.name")}</span>
          </span>
          <LangSwitch />
        </header>
        <main className="flex flex-1 items-center justify-center py-10 max-sm:items-start max-sm:pt-8">
          <div className="w-full max-w-[400px]">{children}</div>
        </main>
      </div>
      <BrandPanel />
    </div>
  );
}
