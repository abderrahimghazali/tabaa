import { requireCompany } from "@/lib/data";
import { BillingForm } from "@/components/settings/billing-form";

export default async function BillingSettingsPage() {
  const company = await requireCompany();
  return <BillingForm company={company} />;
}
