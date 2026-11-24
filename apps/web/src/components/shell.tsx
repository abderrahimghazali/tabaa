import { unstable_rethrow } from "next/navigation";
import { getCompany, getDashboard, getMe } from "@/lib/data";
import { getLocale } from "@/lib/locale";
import { MeProvider } from "@/lib/me-client";
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
  const [, dash] = await Promise.all([getCompany().catch(soft), getDashboard().catch(soft)]);
  return (
    <Providers locale={locale}>
      <MeProvider me={me}>
        <Frame me={me} drafts={dash?.draftCount ?? 0} overdue={dash?.overdueCount ?? 0}>
          {children}
        </Frame>
      </MeProvider>
    </Providers>
  );
}
