import { connection } from "next/server";
import { ApiFailure, api } from "@/lib/api";
import { signedInEmail } from "@/lib/data";
import { InvitationView } from "@/components/auth/invitation";

export default async function InvitationPage({ searchParams }: PageProps<"/invitation">) {
  await connection();
  const sp = await searchParams;
  const token = typeof sp.token === "string" ? sp.token : "";
  if (!token) return <InvitationView token="" preview={null} currentEmail={null} />;
  const [preview, currentEmail] = await Promise.all([
    api.invitationPreview(token).catch((e) => {
      if (e instanceof ApiFailure && e.status !== 0) return null;
      throw e;
    }),
    signedInEmail(),
  ]);
  return <InvitationView token={token} preview={preview} currentEmail={currentEmail} />;
}
