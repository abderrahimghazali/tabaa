import { SettingsShell } from "@/components/settings/settings-shell";

export default function SettingsLayout({ children }: LayoutProps<"/parametres">) {
  return <SettingsShell>{children}</SettingsShell>;
}
