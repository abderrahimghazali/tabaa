import { unstable_rethrow } from "next/navigation";
import { api, ApiFailure } from "@/lib/api";
import { isUuid } from "@/lib/ids";
import { draftPdf, issuedPdf } from "@/lib/invoice-pdf";
import { PdfTimeout, PdfUnavailable } from "@/lib/pdf-render";
import { getT } from "@/lib/locale";

const fail = (status: number, code: string, message: string) =>
  Response.json({ code, message }, { status, headers: { "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });

const safeName = (s: string) => s.replace(/[^A-Za-z0-9._-]/g, "_");

export async function GET(req: Request, ctx: RouteContext<"/factures/[id]/pdf">) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return new Response("Not found", { status: 404 });
  const { t } = await getT();
  try {
    const invoice = await api.invoice(id);
    const draft = invoice.state === "DRAFT";
    const file = draft ? await draftPdf(id, req.url) : await issuedPdf(id, req.url);
    const name = draft ? `brouillon-${id.slice(0, 8)}` : safeName(invoice.number ?? id);
    return new Response(file.bytes as BodyInit, {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${name}.pdf"`,
        "content-length": String(file.bytes.byteLength),
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
        ...(file.etag && { etag: file.etag }),
      },
    });
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof ApiFailure && e.status === 404) return new Response("Not found", { status: 404 });
    if (e instanceof PdfUnavailable) return fail(503, "PDF_UNAVAILABLE", t("pdf.unavailable"));
    if (e instanceof PdfTimeout) return fail(504, "PDF_TIMEOUT", t("pdf.timeout"));
    return fail(502, "PDF_FAILED", t("pdf.failed"));
  }
}
