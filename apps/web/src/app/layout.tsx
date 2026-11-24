import type { Metadata } from "next";
import { Suspense } from "react";
import {
  Bricolage_Grotesque,
  IBM_Plex_Mono,
  Inter,
  IBM_Plex_Sans_Arabic,
} from "next/font/google";
import { BrandLoader } from "@/components/ui/brand";
import "@/styles/globals.css";
import { headers } from "next/headers";
import { getLocale } from "@/lib/locale";

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  weight: ["600", "700"],
});
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], axes: ["opsz"] });
const plexAr = IBM_Plex_Sans_Arabic({
  variable: "--font-plex-ar",
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600"],
});
const plexMono = IBM_Plex_Mono({
  variable: "--font-mono-source",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: { default: "Tabaa", template: "%s · Tabaa" },
  description: "Facturation pour les petites entreprises marocaines.",
};

// Every route is per-visitor and carries a per-request CSP nonce, so the document is never prerendered.
export const instant = false;

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  // React Aria injects a <style> at runtime and reads its CSP nonce from this meta tag.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html
      lang={locale}
      dir={locale === "ar" ? "rtl" : "ltr"}
      suppressHydrationWarning
      className={`${bricolage.variable} ${inter.variable} ${plexAr.variable} ${plexMono.variable} h-full antialiased`}
    >
      <head>
        <meta name="csp-nonce" content={nonce} />
      </head>
      <body>
        <Suspense
          fallback={
            <div className="grid min-h-dvh place-items-center">
              <BrandLoader size={64} label="Chargement" />
            </div>
          }
        >
          {children}
        </Suspense>
      </body>
    </html>
  );
}
