import { api } from "@/lib/api";
import { requireCompany } from "@/lib/data";
import { getT } from "@/lib/locale";
import { BankView } from "@/components/bank/bank-view";
import { PageHeader } from "@/components/app/layout";

const PAGE_SIZE = 50;
const STATUSES = ["UNMATCHED", "MATCHED", "IGNORED"] as const;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

export default async function BankPage({ searchParams }: PageProps<"/banque">) {
  const { t } = await getT();
  await requireCompany();
  const sp = await searchParams;
  const status = STATUSES.find((s) => s === one(sp.status)) ?? "UNMATCHED";
  const q = one(sp.q)?.slice(0, 100) ?? "";
  const importId = one(sp.imp);
  const page = Math.max(1, Number.parseInt(one(sp.page) ?? "1", 10) || 1);
  const [list, imports] = await Promise.all([
    api.bankTransactions({ status, q, importId, page: String(page), pageSize: String(PAGE_SIZE) }),
    api.bankImports(),
  ]);
  return (
    <div>
      <PageHeader title={t("bank.title")} subtitle={t("bank.subtitle")} />
      <BankView list={list} imports={imports} status={status} q={q} importId={importId ?? "all"} page={page} pageSize={PAGE_SIZE} openImport={one(sp.new) === "1"} />
    </div>
  );
}
