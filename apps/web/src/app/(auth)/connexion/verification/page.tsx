import { MfaForm } from "@/components/auth/forms";
import { safeNext } from "@/lib/session";

export default async function MfaPage({ searchParams }: PageProps<"/connexion/verification">) {
  const sp = await searchParams;
  return <MfaForm next={typeof sp.next === "string" ? safeNext(sp.next) : undefined} />;
}
