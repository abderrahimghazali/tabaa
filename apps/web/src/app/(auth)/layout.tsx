import { AuthFrame } from "@/components/auth/auth-frame";
import { Providers } from "@/components/providers";
import { getLocale } from "@/lib/locale";

export default async function AuthLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  return (
    <Providers locale={locale}>
      <AuthFrame>{children}</AuthFrame>
    </Providers>
  );
}
