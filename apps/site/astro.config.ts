import { defineConfig, fontProviders } from "astro/config";
import sitemap from "@astrojs/sitemap";
import { base, site } from "./site.config";
import { lastVerified } from "./src/data/reforme";

export default defineConfig({
  site,
  base,
  output: "static",
  trailingSlash: "always",
  devToolbar: { enabled: false },
  build: { inlineStylesheets: "always" },
  integrations: [
    sitemap({
      serialize(item) {
        item.lastmod = new Date(`${lastVerified}T00:00:00Z`).toISOString();
        return item;
      },
    }),
  ],
  fonts: [
    {
      name: "Inter",
      cssVariable: "--font-inter",
      provider: fontProviders.fontsource(),
      weights: [400, 500, 600],
      styles: ["normal"],
      subsets: ["latin", "latin-ext"],
      fallbacks: ["system-ui", "sans-serif"],
    },
    {
      name: "IBM Plex Mono",
      cssVariable: "--font-plex-mono",
      provider: fontProviders.fontsource(),
      weights: [400, 500],
      styles: ["normal"],
      subsets: ["latin"],
      fallbacks: ["ui-monospace", "monospace"],
    },
    {
      name: "Bricolage Grotesque",
      cssVariable: "--font-bricolage",
      provider: fontProviders.fontsource(),
      weights: [700],
      styles: ["normal"],
      subsets: ["latin"],
      fallbacks: ["system-ui", "sans-serif"],
    },
  ],
});
