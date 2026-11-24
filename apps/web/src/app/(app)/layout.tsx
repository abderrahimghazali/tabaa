import { Suspense } from "react";
import { Shell } from "@/components/shell";
import { BrandLoader } from "@/components/ui/brand";

// The session is checked on every request (and a revoked one redirects), so this segment is never an instant shell.
export const instant = false;

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
