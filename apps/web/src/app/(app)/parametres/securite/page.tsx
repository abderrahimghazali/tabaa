import { unstable_rethrow } from "next/navigation";
import { api } from "@/lib/api";
import { getMe } from "@/lib/data";
import { meCan } from "@/lib/me";
import { SecurityPanel } from "@/components/settings/security-panel";

export default async function SecurityPage() {
  const me = await getMe();
  let events: Awaited<ReturnType<typeof api.auditEvents>> = [];
  let failed = false;
  if (meCan(me, "auditLog")) {
    try {
      events = await api.auditEvents();
    } catch (e) {
      unstable_rethrow(e);
      failed = true;
    }
  }
  return <SecurityPanel role={me.role} initialEvents={events} auditFailed={failed} />;
}
