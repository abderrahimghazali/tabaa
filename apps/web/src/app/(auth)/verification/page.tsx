import { VerifyEmail } from "@/components/auth/forms";

export default async function VerificationPage({ searchParams }: PageProps<"/verification">) {
  const sp = await searchParams;
  return <VerifyEmail token={typeof sp.token === "string" ? sp.token : undefined} />;
}
