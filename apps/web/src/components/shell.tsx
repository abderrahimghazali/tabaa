import { unstable_rethrow } from "next/navigation";
import { getBankToMatch, getCompany, getDashboard, getMe, getPurchaseOverview } from "@/lib/data";
import { getLocale } from "@/lib/locale";
import { MeProvider } from "@/lib/me-client";
import { can } from "@/lib/permissions";
import { Providers } from "./providers";
import { Frame } from "./frame";

const soft = (e: unknown) => {
  unstable_rethrow(e);
  return null;
};

export async function Shell({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  // An expired session redirects to /session-expiree from inside the API client.
  const me = await getMe();
  const [, dash, bank, purchases] = await Promise.all([getCompany().catch(soft), getDashboard().catch(soft), getBankToMatch().catch(soft), getPurchaseOverview().catch(soft)]);
  return (
    <Providers locale={locale}>
      <MeProvider me={me}>
        <Frame me={me} drafts={dash?.draftCount ?? 0} overdue={dash?.overdueCount ?? 0} bank={bank ?? 0} toApprove={can(me.role, "admin") ? (purchases?.toApprove ?? 0) : 0}>
          {children}
        </Frame>
      </MeProvider>
    </Providers>
  );
}
