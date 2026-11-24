import { api, ApiFailure } from "@/lib/api";

export async function GET(_req: Request, ctx: RouteContext<"/factures/[id]/ubl">) {
  const { id } = await ctx.params;
  try {
    const xml = await api.ubl(id);
    const invoice = await api.invoice(id);
    return new Response(xml, {
      headers: {
        "content-type": "application/xml; charset=utf-8",
        "content-disposition": `attachment; filename="${invoice.number ?? id}.xml"`,
      },
    });
  } catch (e) {
    const status = e instanceof ApiFailure && e.status > 0 ? e.status : 502;
    return new Response("UBL unavailable", { status });
  }
}
