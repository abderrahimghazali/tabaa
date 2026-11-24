"use client";

import { useState, useTransition } from "react";
import { validateIce, type ApiError, type Party, type PartyInput } from "@facture/core";
import { Button } from "@/components/base/buttons/button";
import { Drawer, DrawerBody, DrawerFooter, DrawerHeader } from "@/components/base/drawer/drawer";
import { Input } from "@/components/base/input/input";
import { Notification } from "@/components/base/notification/notification";
import { NumberField } from "@/components/base/number-field/number-field";
import { Select, SelectItem } from "@/components/base/select/select";
import { toast } from "@/components/base/toast/toast";
import { createParty, updateParty } from "@/lib/actions";
import { digits, groupDigits, ICE_GROUPS } from "@/lib/format";
import { useT } from "@/lib/i18n-client";
import { issuesAt } from "@/lib/result";

const TYPES = ["BUSINESS", "PUBLIC", "CONSUMER", "FOREIGN"] as const;
const opt = (s: string) => (s.trim() ? s.trim() : undefined);

export function PartyForm({
  initial,
  formId,
  onSaved,
  onPending,
}: {
  initial?: Party;
  formId: string;
  onSaved: (party: Party) => void;
  onPending?: (pending: boolean) => void;
}) {
  const t = useT();
  const [, start] = useTransition();
  const [error, setError] = useState<ApiError | null>(null);
  const [v, setV] = useState({
    type: initial?.type ?? "BUSINESS",
    name: initial?.name ?? "",
    ice: digits(initial?.ice ?? ""),
    ifNumber: initial?.ifNumber ?? "",
    line1: initial?.address.line1 ?? "",
    line2: initial?.address.line2 ?? "",
    postalCode: initial?.address.postalCode ?? "",
    city: initial?.address.city ?? "",
    country: initial?.address.country ?? "MA",
    email: initial?.email ?? "",
    phone: initial?.phone ?? "",
    term: initial?.paymentTermDays?.toString() ?? "",
  });
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((s) => ({ ...s, [k]: val }));
  const iceCheck = v.ice ? validateIce(v.ice) : null;
  const iceError = issuesAt(error, "ice") ?? (iceCheck && !iceCheck.valid ? t("ice.invalid", { n: v.ice.length }) : undefined);
  const err = (path: string) => issuesAt(error, path);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const input: PartyInput = {
      kind: initial?.kind ?? "CUSTOMER",
      type: v.type,
      name: v.name.trim(),
      ice: opt(v.ice),
      ifNumber: opt(v.ifNumber),
      address: {
        line1: v.line1.trim(),
        line2: opt(v.line2),
        postalCode: opt(v.postalCode),
        city: v.city.trim(),
        country: v.type === "FOREIGN" ? v.country.trim().toUpperCase() : "MA",
      },
      email: opt(v.email),
      phone: opt(v.phone),
      paymentTermDays: v.term.trim() ? Number(v.term) : undefined,
    };
    setError(null);
    onPending?.(true);
    start(async () => {
      const res = initial ? await updateParty(initial.id, input) : await createParty(input);
      onPending?.(false);
      if (res.ok) {
        toast.success(initial ? t("customers.updated") : t("customers.created"));
        onSaved(res.data);
      } else setError(res.error);
    });
  };

  const MAX: Record<string, number> = { name: 200, "address.line1": 200, "address.line2": 200, "address.postalCode": 20, "address.city": 100 };
  const field = (path: string, label: string, value: string, onChange: (s: string) => void, extra: Record<string, unknown> = {}) => (
    <Input label={label} value={value} onChange={onChange} maxLength={MAX[path]} isInvalid={!!err(path)} errorMessage={err(path)} {...extra} />
  );

  return (
    <form id={formId} onSubmit={submit} className="flex flex-col gap-4 py-2" noValidate>
      {error && (
        <Notification
          status="error"
          dismissible={false}
          title={error.code === "VALIDATION" ? t("error.fixFields") : error.message}
        />
      )}
      <Select label={t("customers.type")} selectedKey={v.type} onSelectionChange={(k) => set("type", String(k) as typeof v.type)}>
        {TYPES.map((x) => (
          <SelectItem key={x} id={x} textValue={t(`partyType.${x}`)}>
            {t(`partyType.${x}`)}
          </SelectItem>
        ))}
      </Select>
      {field("name", t("customers.name"), v.name, (s) => set("name", s), { isRequired: true })}
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="ICE"
          inputMode="numeric"
          placeholder="000000000 0000 00"
          value={groupDigits(v.ice.slice(0, 15), ICE_GROUPS)}
          onChange={(s) => set("ice", digits(s).slice(0, 15))}
          inputClassName="ident"
          isInvalid={!!iceError}
          errorMessage={iceError}
          hint={v.ice && !iceError ? t("ice.valid") : t("ice.hint")}
        />
        {field("ifNumber", "IF", v.ifNumber, (s) => set("ifNumber", s), { inputClassName: "ident" })}
      </div>
      {field("address.line1", t("field.address"), v.line1, (s) => set("line1", s))}
      {field("address.line2", t("field.address2"), v.line2, (s) => set("line2", s))}
      <div className="grid grid-cols-[120px_1fr] gap-4">
        {field("address.postalCode", t("field.postalCode"), v.postalCode, (s) => set("postalCode", s), { inputClassName: "num" })}
        {field("address.city", t("field.city"), v.city, (s) => set("city", s))}
      </div>
      {v.type === "FOREIGN" &&
        field("address.country", t("field.country"), v.country, (s) => set("country", s), { maxLength: 2, hint: t("field.countryHint"), inputClassName: "ident" })}
      <div className="grid gap-4 sm:grid-cols-2">
        {field("email", t("field.email"), v.email, (s) => set("email", s), { type: "email" })}
        {field("phone", t("field.phone"), v.phone, (s) => set("phone", s), { type: "tel", inputClassName: "num" })}
      </div>
      <NumberField
        label={t("customers.term")}
        hint={err("paymentTermDays") ?? t("customers.termHint")}
        isInvalid={!!err("paymentTermDays")}
        minValue={0}
        maxValue={180}
        formatOptions={{ maximumFractionDigits: 0, useGrouping: false }}
        value={v.term === "" ? Number.NaN : Number(v.term)}
        onChange={(n) => set("term", Number.isNaN(n) ? "" : String(n))}
        className="sm:max-w-48"
      />
    </form>
  );
}

export function PartyFormFooter({ formId, pending, onCancel }: { formId: string; pending: boolean; onCancel: () => void }) {
  const t = useT();
  return (
    <>
      <Button variant="secondary" onClick={onCancel}>
        {t("common.cancel")}
      </Button>
      <Button type="submit" form={formId} disabled={pending}>
        {t("common.save")}
      </Button>
    </>
  );
}

/** Create or edit a customer in a BoardUI drawer; `onDelete` adds a destructive action to the footer. */
export function PartyDrawer({
  isOpen,
  onOpenChange,
  party,
  onSaved,
  onDelete,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  party?: Party;
  onSaved?: (party: Party) => void;
  onDelete?: () => void;
}) {
  const t = useT();
  const [pending, setPending] = useState(false);
  return (
    <Drawer isOpen={isOpen} onOpenChange={onOpenChange} placement="end" aria-label={party ? party.name : t("customers.new")}>
      {({ close }) => (
        <>
          <DrawerHeader title={party ? party.name : t("customers.new")} closeLabel={t("common.close")} />
          <DrawerBody>
            <PartyForm
              formId="party-form"
              initial={party}
              onPending={setPending}
              onSaved={(p) => {
                close();
                onSaved?.(p);
              }}
            />
          </DrawerBody>
          <DrawerFooter>
            {onDelete && (
              <Button variant="danger" onClick={onDelete} className="sm:me-auto">
                {t("common.delete")}
              </Button>
            )}
            <PartyFormFooter formId="party-form" pending={pending} onCancel={close} />
          </DrawerFooter>
        </>
      )}
    </Drawer>
  );
}
