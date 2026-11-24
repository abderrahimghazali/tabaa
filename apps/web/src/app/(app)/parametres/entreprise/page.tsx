import { getCompany } from "@/lib/data";
import { CompanyForm } from "@/components/settings/company-form";

export default async function CompanySettingsPage() {
  const company = await getCompany();
  return <CompanyForm company={company} />;
}
