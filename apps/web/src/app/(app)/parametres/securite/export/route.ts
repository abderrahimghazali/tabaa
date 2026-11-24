import { unstable_rethrow } from "next/navigation";
import { api, ApiFailure } from "@/lib/api";

export async function GET() {
  try {
    const json = await api.exportData();
    const day = new Date().toISOString().slice(0, 10);
    return new Response(json, {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="tabaa-export-${day}.json"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    unstable_rethrow(e);
    return new Response("Export unavailable", { status: e instanceof ApiFailure && e.status === 403 ? 403 : 502 });
  }
}
