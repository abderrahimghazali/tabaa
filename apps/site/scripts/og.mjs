// Regenerates the Open Graph image and the favicon set. Needs the dev server (pnpm --filter @facture/site dev) and
// Playwright's Chromium (pnpm --filter web pdf:install). Output goes to public/ and is committed.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const require = createRequire(new URL("../../web/package.json", import.meta.url));
const { chromium } = require("playwright-core");
const root = new URL("../", import.meta.url);
const pub = (name) => fileURLToPath(new URL(`public/${name}`, root));
const origin = process.argv[2] ?? "http://localhost:3300/tabaa";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.goto(`${origin}/og-card/`, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.locator("#card").screenshot({ path: pub("og.png") });

const icon = readFileSync(pub("favicon.svg"), "utf8");
const icons = await browser.newPage();
const render = async (size, name) => {
  await icons.setViewportSize({ width: size, height: size });
  await icons.setContent(`<body style="margin:0;background:transparent"><div style="width:${size}px;height:${size}px">${icon.replace("<svg", `<svg width="${size}" height="${size}"`)}</div></body>`);
  const buf = await icons.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  if (name) writeFileSync(pub(name), buf);
  return buf;
};
await render(180, "apple-touch-icon.png");
const png32 = await render(32);
const header = Buffer.alloc(22);
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
header.writeUInt8(32, 6); header.writeUInt8(32, 7); header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12);
header.writeUInt32LE(png32.length, 14); header.writeUInt32LE(22, 18);
writeFileSync(pub("favicon.ico"), Buffer.concat([header, png32]));
await browser.close();
