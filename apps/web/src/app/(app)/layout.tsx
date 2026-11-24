import { Suspense } from "react";
import { Shell } from "@/components/shell";
import { BrandLoader } from "@/components/ui/brand";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-dvh place-items-center">
          <BrandLoader size={64} label="Chargement" />
        </div>
      }
    >
      <Shell>{children}</Shell>
    </Suspense>
  );
}
