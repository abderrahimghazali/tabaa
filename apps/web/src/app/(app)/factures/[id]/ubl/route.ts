import { unstable_rethrow } from "next/navigation";
import { api, ApiFailure } from "@/lib/api";
import { isUuid } from "@/lib/ids";

export async function GET(_req: Request, ctx: RouteContext<"/factures/[id]/ubl">) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return new Response("Not found", { status: 404 });
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
    unstable_rethrow(e);
    const status = e instanceof ApiFailure && e.status > 0 ? e.status : 502;
    return new Response("UBL unavailable", { status });
  }
}
