import { ReportsShell } from "@/components/reports/reports-shell";

export default function DeclarationsLayout({ children }: LayoutProps<"/declarations">) {
  return <ReportsShell>{children}</ReportsShell>;
}
