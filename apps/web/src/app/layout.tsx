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

// The locale cookie is read here so the static shell keeps lang/dir correct before first paint.
const localeScript = `(function(){try{var m=document.cookie.match(/(?:^|; )locale=(fr|ar)/);if(m&&m[1]==="ar"){var d=document.documentElement;d.lang="ar";d.dir="rtl"}}catch(e){}})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fr"
      dir="ltr"
      suppressHydrationWarning
      className={`${bricolage.variable} ${inter.variable} ${plexAr.variable} ${plexMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: localeScript }} />
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
