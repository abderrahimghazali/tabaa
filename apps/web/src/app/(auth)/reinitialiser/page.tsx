import { ResetForm } from "@/components/auth/forms";

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reinitialiser">) {
  const sp = await searchParams;
  return <ResetForm token={typeof sp.token === "string" ? sp.token : undefined} />;
}
