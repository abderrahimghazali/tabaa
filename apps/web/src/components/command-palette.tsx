"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  RiAddLine,
  RiArrowDownLine,
  RiArrowUpLine,
  RiCornerDownLeftLine,
  RiBox3Line,
  RiBuilding2Line,
  RiFileList3Line,
  RiGroupLine,
  RiHome5Line,
  RiSettings4Line,
  RiBankLine,
  RiShoppingBag3Line,
  RiTruckLine,
} from "@remixicon/react";
import { Kbd } from "@/components/base/kbd/kbd";
import { usePhone } from "@/lib/use-phone";
import { CommandPalette, CommandPaletteItem, CommandPaletteSection } from "@/components/base/command-palette/command-palette";
import { searchAll } from "@/lib/actions";
import { fmtNumber, groupDigits, ICE_GROUPS } from "@/lib/format";
import { useI18n } from "@/lib/i18n-client";
import { useCanWrite } from "@/lib/me-client";
import type { Key } from "@/lib/i18n";

type Entry = { id: string; label: string; description?: string };
type Remote = { invoices: Entry[]; parties: Entry[] };

const Ctx = createContext<() => void>(() => {});
export const usePaletteTrigger = () => useContext(Ctx);

const ACTIONS: { id: string; key: Key; icon: typeof RiAddLine }[] = [
  { id: "/factures/nouvelle", key: "invoices.new", icon: RiAddLine },
  { id: "/clients?new=1", key: "customers.new", icon: RiAddLine },
  { id: "/articles?new=1", key: "items.new", icon: RiAddLine },
  { id: "/banque?new=1", key: "bank.import", icon: RiBankLine },
  { id: "/achats/nouvelle", key: "purchases.new", icon: RiAddLine },
  { id: "/", key: "nav.dashboard", icon: RiHome5Line },
  { id: "/factures", key: "nav.invoices", icon: RiFileList3Line },
  { id: "/banque", key: "nav.bank", icon: RiBankLine },
  { id: "/achats", key: "nav.purchases", icon: RiShoppingBag3Line },
  { id: "/clients", key: "nav.customers", icon: RiGroupLine },
  { id: "/fournisseurs", key: "nav.suppliers", icon: RiTruckLine },
  { id: "/articles", key: "nav.items", icon: RiBox3Line },
  { id: "/parametres/entreprise", key: "company.settings", icon: RiBuilding2Line },
  { id: "/parametres", key: "nav.settings", icon: RiSettings4Line },
];

export function CommandPaletteHost({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const phone = usePhone();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [remote, setRemote] = useState<Remote>({ invoices: [], parties: [] });
  const seq = useRef(0);

  const toggle = useCallback(() => setOpen((o) => !o), []);

  useEffect(() => {
    const term = q.trim();
    if (!open || !term) {
      setRemote({ invoices: [], parties: [] });
      return;
    }
    const n = ++seq.current;
    const id = setTimeout(async () => {
      const res = await searchAll(term);
      if (n !== seq.current) return;
      setRemote({
        invoices: res.invoices.map((i) => ({
          id: `/factures/${i.id}`,
          label: `${i.number ?? t("invoices.noNumber")} · ${i.customerName}`,
          description: fmtNumber(i.totalGross),
        })),
        parties: res.parties.map((p) => ({
          id: `/clients/${p.id}`,
          label: p.name,
          description: p.ice ? groupDigits(p.ice, ICE_GROUPS) : undefined,
        })),
      });
    }, 180);
    return () => clearTimeout(id);
  }, [q, open, t]);

  const term = q.trim().toLowerCase();
  const writable = useCanWrite();
  const actions = ACTIONS.filter((a) => writable || !a.id.includes("nouvelle") && !a.id.includes("new=1"))
    .map((a) => ({ ...a, label: t(a.key) }))
    .filter((a) => !term || a.label.toLowerCase().includes(term));

  return (
    <Ctx value={toggle}>
      {children}
      <CommandPalette
        isOpen={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setQ("");
        }}
        inputValue={q}
        onInputChange={setQ}
        filter={null}
        aria-label={t("palette.quick")}
        placeholder={t("palette.placeholder")}
        emptyState={t("palette.empty")}
        onAction={(key) => router.push(String(key))}
        footer={
          phone ? false : (
          <>
            <span className="flex items-center gap-1.5">
              <Kbd aria-label="↑"><RiArrowUpLine className="size-3" aria-hidden /></Kbd>
              <Kbd aria-label="↓"><RiArrowDownLine className="size-3" aria-hidden /></Kbd>
              {t("palette.navigate")}
            </span>
            <span className="flex items-center gap-1.5">
              <Kbd aria-label="Entrée"><RiCornerDownLeftLine className="size-3" aria-hidden /></Kbd>
              {t("palette.select")}
            </span>
          </>
          )
        }
      >
        {remote.invoices.length > 0 && (
          <CommandPaletteSection key="invoices" title={t("palette.invoices")}>
            {remote.invoices.map((i) => (
              <CommandPaletteItem key={i.id} id={i.id} icon={RiFileList3Line} description={i.description}>
                {i.label}
              </CommandPaletteItem>
            ))}
          </CommandPaletteSection>
        )}
        {remote.parties.length > 0 && (
          <CommandPaletteSection key="customers" title={t("palette.customers")}>
            {remote.parties.map((p) => (
              <CommandPaletteItem key={p.id} id={p.id} icon={RiGroupLine} description={p.description}>
                {p.label}
              </CommandPaletteItem>
            ))}
          </CommandPaletteSection>
        )}
        {actions.length > 0 && (
          <CommandPaletteSection key="actions" title={t("palette.actions")}>
            {actions.map((a) => (
              <CommandPaletteItem key={a.id} id={a.id} icon={a.icon}>
                {a.label}
              </CommandPaletteItem>
            ))}
          </CommandPaletteSection>
        )}
      </CommandPalette>
    </Ctx>
  );
}
