import { Decimal } from "decimal.js";
import type { Company, InvoiceInput, InvoiceTotals, Party } from "./contracts.js";
import { addDays } from "./dates.js";
import { validateIce } from "./identifiers.js";
import type { RulePackage } from "./rules.js";

export interface Issue {
  path: string;
  rule: string;
  message: string;
  severity: "error" | "warning";
}

const blank = (s: string | undefined) => !s || s.trim() === "";

export function validateForIssue(input: {
  company: Company;
  customer: Party;
  invoice: InvoiceInput;
  totals: InvoiceTotals;
  rules: RulePackage;
}): Issue[] {
  const { company, customer, invoice, totals, rules } = input;
  const issues: Issue[] = [];
  const error = (path: string, rule: string, message: string) =>
    issues.push({ path, rule, message, severity: "error" });
  const warning = (path: string, rule: string, message: string) =>
    issues.push({ path, rule, message, severity: "warning" });

  if (blank(company.ice)) {
    error("company.ice", "MA-ICE-SELLER", "L'ICE de l'entreprise est obligatoire");
  } else {
    const check = validateIce(company.ice);
    if (!check.valid) error("company.ice", "MA-ICE-SELLER", `ICE de l'entreprise invalide : ${check.reason}`);
  }
  if (blank(company.ifNumber)) {
    error("company.ifNumber", "MA-IF-SELLER", "L'identifiant fiscal (IF) de l'entreprise est obligatoire");
  }

  if (customer.type === "BUSINESS" || customer.type === "PUBLIC") {
    if (blank(customer.ice)) {
      error("customer.ice", "MA-ICE-BUYER", "L'ICE du client est obligatoire pour une entreprise ou un organisme public");
    } else {
      const check = validateIce(customer.ice!);
      if (!check.valid) error("customer.ice", "MA-ICE-BUYER", `ICE du client invalide : ${check.reason}`);
    }
  }

  if (invoice.lines.length === 0) {
    error("invoice.lines", "LINE-QTY", "La facture doit comporter au moins une ligne");
  }
  const allowedRates = rules.vatRates.map((r) => new Decimal(r));
  invoice.lines.forEach((line, i) => {
    const base = `invoice.lines.${i}`;
    if (new Decimal(line.quantity).lte(0)) {
      error(`${base}.quantity`, "LINE-QTY", `Ligne ${i + 1} : la quantité doit être supérieure à zéro`);
    }
    if (new Decimal(line.unitPrice).lt(0)) {
      error(`${base}.unitPrice`, "LINE-PRICE", `Ligne ${i + 1} : le prix unitaire ne peut pas être négatif`);
    }
    const rate = new Decimal(line.vatRate);
    if (!allowedRates.some((r) => r.eq(rate))) {
      error(`${base}.vatRate`, "VAT-RATE", `Ligne ${i + 1} : taux de TVA ${line.vatRate} % non autorisé (${rules.vatRates.join(", ")})`);
    }
    if (company.vatRegime === "NOT_SUBJECT" && !rate.isZero()) {
      error(`${base}.vatRate`, "VAT-NOT-SUBJECT", `Ligne ${i + 1} : l'entreprise n'est pas assujettie à la TVA, le taux doit être 0`);
    }
  });

  if (new Decimal(totals.totalGross).lte(0)) {
    error("invoice.totals", "TOTAL-POSITIVE", "Le total TTC doit être supérieur à zéro");
  }

  if (invoice.type === "CREDIT_NOTE" && !invoice.originalInvoiceId) {
    error("invoice.originalInvoiceId", "CN-ORIGINAL", "Un avoir doit référencer la facture d'origine");
  }

  if (invoice.dueDate) {
    if (invoice.dueDate < invoice.issueDate) {
      error("invoice.dueDate", "DUE-BEFORE-ISSUE", "La date d'échéance ne peut pas précéder la date d'émission");
    } else if (invoice.dueDate > addDays(invoice.issueDate, rules.maxPaymentTermDays)) {
      warning("invoice.dueDate", "TERM-OVER-LEGAL", `Le délai de paiement dépasse le maximum légal de ${rules.maxPaymentTermDays} jours`);
    }
  }

  if (blank(company.rcNumber)) warning("company.rcNumber", "MA-RC-SELLER", "Le numéro de RC de l'entreprise est manquant");
  if (blank(company.tpNumber)) warning("company.tpNumber", "MA-TP-SELLER", "Le numéro de taxe professionnelle (TP) de l'entreprise est manquant");
  if (blank(company.cnssNumber)) warning("company.cnssNumber", "MA-CNSS-SELLER", "Le numéro CNSS de l'entreprise est manquant");

  if (invoice.paymentMethod === "CASH") {
    warning("invoice.paymentMethod", "CASH-STAMP", "Paiement en espèces : le droit de timbre s'applique");
  }

  return issues;
}
