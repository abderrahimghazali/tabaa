import "server-only";
import { cookies, headers } from "next/headers";
import { ApiError } from "@facture/core";
import { apiRoot, upstreamHeaders } from "./upstream";
import { SESSION_COOKIE } from "./session";
import { renderPdf, selfOrigin } from "./pdf-render";
import { signRenderToken } from "./render-token";

const url = (id: string) => `${apiRoot()}/v1/invoices/${encodeURIComponent(id)}/pdf`;

export type StoredPdf = { bytes: Uint8Array; etag: string | null };

async function code(res: Response) {
  const parsed = ApiError.safeParse(await res.json().catch(() => null));
  return parsed.success ? parsed.data.code : "UNKNOWN";
}

async function stored(id: string): Promise<StoredPdf | "missing"> {
  const res = await fetch(url(id), { cache: "no-store", headers: await upstreamHeaders(false) });
  if (res.status === 200) return { bytes: new Uint8Array(await res.arrayBuffer()), etag: res.headers.get("etag") };
  if (res.status === 404 && (await code(res)) === "PDF_NOT_GENERATED") return "missing";
  throw new Error(`PDF fetch answered ${res.status}`);
}

async function store(id: string, bytes: Uint8Array): Promise<"stored" | "exists"> {
  const res = await fetch(url(id), {
    method: "PUT",
    cache: "no-store",
    headers: { ...(await upstreamHeaders(false)), "content-type": "application/pdf" },
    body: bytes as BodyInit,
  });
  if (res.status === 204) return "stored";
  if (res.status === 409 && (await code(res)) === "PDF_ALREADY_STORED") return "exists";
  throw new Error(`PDF store answered ${res.status}`);
}

async function render(id: string, requestUrl: string): Promise<Uint8Array> {
  const session = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!session) throw new Error("no session");
  const token = signRenderToken(process.env.INTERNAL_API_TOKEN ?? "", id);
  return renderPdf(selfOrigin(requestUrl), `/impression/${encodeURIComponent(id)}?token=${token}`, session);
}

/** An issued invoice's PDF is rendered once, stored by the API, and then always served from there. */
export async function issuedPdf(id: string, requestUrl: string): Promise<StoredPdf> {
  const existing = await stored(id);
  if (existing !== "missing") return existing;
  const bytes = await render(id, requestUrl);
  if ((await store(id, bytes)) === "stored") {
    const again = await stored(id);
    return again === "missing" ? { bytes, etag: null } : again;
  }
  const winner = await stored(id);
  if (winner === "missing") throw new Error("stored PDF vanished");
  return winner;
}

export async function draftPdf(id: string, requestUrl: string): Promise<StoredPdf> {
  return { bytes: await render(id, requestUrl), etag: null };
}

/**
 * Makes sure an issued invoice's PDF is stored before it is emailed.
 * Server actions have no request URL: only the port of the Host header is used (the host itself never is; see selfOrigin).
 */
export async function ensureStoredPdf(id: string): Promise<void> {
  const host = (await headers()).get("host") ?? "";
  const port = /:(\d{1,5})$/.exec(host)?.[1];
  await issuedPdf(id, `http://localhost${port ? `:${port}` : ""}/`);
}
