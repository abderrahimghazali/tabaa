import { SignInForm } from "@/components/auth/forms";
import { safeNext } from "@/lib/session";

export default async function SignInPage({ searchParams }: PageProps<"/connexion">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? safeNext(sp.next) : undefined;
  return <SignInForm next={next} expired={sp.expired === "1"} reset={sp.reset === "1"} />;
}
