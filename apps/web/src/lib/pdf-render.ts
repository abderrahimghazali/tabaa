import "server-only";
import { chromium, type Browser } from "playwright-core";
import { SESSION_COOKIE } from "./session";

export class PdfUnavailable extends Error {}
export class PdfTimeout extends Error {}

const MAX_PARALLEL = 2;
const TIMEOUT_MS = 20_000;

let browser: Promise<Browser> | null = null;

function launch(): Promise<Browser> {
  const executablePath = process.env.CHROMIUM_PATH || undefined;
  const pending = chromium.launch({ executablePath, headless: true }).then(
    (b) => {
      b.on("disconnected", () => {
        if (browser === pending) browser = null;
      });
      return b;
    },
    (e: unknown) => {
      if (browser === pending) browser = null;
      throw new PdfUnavailable(e instanceof Error ? e.message : "launch failed");
    },
  );
  return pending;
}

const getBrowser = () => (browser ??= launch());

let active = 0;
const waiting: Array<() => void> = [];

async function slot<T>(work: () => Promise<T>): Promise<T> {
  if (active >= MAX_PARALLEL) await new Promise<void>((resolve) => waiting.push(resolve));
  else active++;
  try {
    return await work();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else active--;
  }
}

/** The app's own address as the headless browser sees it: loopback, never taken from request headers. */
export function selfOrigin(requestUrl: string): string {
  if (process.env.APP_ORIGIN) return new URL(process.env.APP_ORIGIN).origin;
  const port = new URL(requestUrl).port || process.env.PORT || "3000";
  return `http://localhost:${port}`;
}

async function render(origin: string, path: string, session: string): Promise<Uint8Array> {
  const b = await getBrowser();
  const context = await b.newContext({ viewport: { width: 794, height: 1123 }, serviceWorkers: "block" });
  try {
    await context.route("**/*", (route) => {
      const url = route.request().url();
      return url.startsWith(`${origin}/`) ? route.continue() : route.abort();
    });
    await context.addCookies([{ name: SESSION_COOKIE, value: session, url: origin, httpOnly: true, sameSite: "Lax" }]);
    const page = await context.newPage();
    page.setDefaultTimeout(TIMEOUT_MS);
    const res = await page.goto(`${origin}${path}`, { waitUntil: "networkidle", timeout: TIMEOUT_MS });
    if (!res?.ok()) throw new Error(`print page answered ${res?.status() ?? "nothing"}`);
    await page.waitForSelector("[data-print-sheet]", { timeout: TIMEOUT_MS });
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    await page.emulateMedia({ media: "print" });
    return await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
  } finally {
    await context.close().catch(() => {});
  }
}

export function renderPdf(origin: string, path: string, session: string): Promise<Uint8Array> {
  return slot(() => {
    let timer: ReturnType<typeof setTimeout>;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new PdfTimeout("render timed out")), TIMEOUT_MS + 1000);
    });
    return Promise.race([render(origin, path, session), deadline]).finally(() => clearTimeout(timer));
  });
}
