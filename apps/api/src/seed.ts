import { NestFactory } from '@nestjs/core';
import type { InvoiceInput, Item, LineInput, PartyInput } from '@facture/core';
import { Decimal } from 'decimal.js';
import { AppModule } from './app.module.js';
import { TenantDb } from './db/tenant-db.js';
import { assertLocalDevDatabase, wipeTenant } from './db/wipe.js';
import { env } from './env.js';
import { AuthService } from './auth/auth.service.js';
import { CompanyService } from './company/company.service.js';
import { ItemsService } from './items/items.service.js';
import { PartiesService } from './parties/parties.service.js';
import { InvoicesService } from './invoices/invoices.service.js';

const day = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString('en-CA');
};

const addr = (line1: string, city: string, postalCode: string, country = 'MA') => ({ line1, city, postalCode, country });

const customers: PartyInput[] = [
  { kind: 'CUSTOMER', type: 'BUSINESS', name: 'Atlas Distribution SARL', ice: '001509876000041', ifNumber: '15098761', address: addr('45 boulevard Zerktouni', 'Casablanca', '20100'), email: 'compta@atlas-distribution.ma', phone: '+212 5 22 47 11 20', paymentTermDays: 30 },
  { kind: 'CUSTOMER', type: 'BUSINESS', name: 'Cabinet Benjelloun & Associés', ice: '001623450000087', ifNumber: '16234502', address: addr('12 avenue Mohammed V', 'Rabat', '10000'), email: 'secretariat@benjelloun-associes.ma', phone: '+212 5 37 70 31 45' },
  { kind: 'CUSTOMER', type: 'BUSINESS', name: 'Tanger Med Logistics SA', ice: '001784512000063', ifNumber: '17845123', address: addr('Zone franche Ksar Sghir, lot 14', 'Tanger', '90000'), email: 'facturation@tml.ma', phone: '+212 5 39 33 80 00', paymentTermDays: 45 },
  { kind: 'CUSTOMER', type: 'BUSINESS', name: 'Riad Al Andalous', ice: '002011234000019', ifNumber: '20112342', address: addr('8 derb Sidi Bouamar, Médina', 'Marrakech', '40000'), email: 'direction@riad-alandalous.ma' },
  { kind: 'CUSTOMER', type: 'BUSINESS', name: 'Souss Agri Export SARL', ice: '001896543000072', ifNumber: '18965434', address: addr('Zone industrielle Ait Melloul, lot 27', 'Agadir', '80000'), email: 'admin@soussagri.ma', phone: '+212 5 28 24 60 12' },
  { kind: 'CUSTOMER', type: 'BUSINESS', name: 'Technopark Solutions SARL', ice: '002145678000025', ifNumber: '21456785', address: addr('Technopark, route de Nouaceur', 'Casablanca', '20200'), email: 'finance@technopark-solutions.ma', paymentTermDays: 30 },
  { kind: 'CUSTOMER', type: 'BUSINESS', name: 'Imprimerie Moderne SARL', ice: '001934567000038', ifNumber: '19345676', address: addr('27 rue Oqba, Agdal', 'Rabat', '10090'), email: 'contact@imprimerie-moderne.ma' },
  { kind: 'CUSTOMER', type: 'PUBLIC', name: 'Commune urbaine de Salé', ice: '000112233000054', address: addr('Hôtel de ville, avenue Hassan II', 'Salé', '11000'), phone: '+212 5 37 80 55 00' },
  { kind: 'CUSTOMER', type: 'CONSUMER', name: 'Mohamed Alaoui', address: addr('19 rue des Orangers, Maârif', 'Casablanca', '20330'), phone: '+212 6 61 23 45 67' },
  { kind: 'CUSTOMER', type: 'FOREIGN', name: 'Studio Lumière SAS', address: addr('14 quai Saint-Antoine', 'Lyon', '69002', 'FR'), email: 'compta@studio-lumiere.fr' },
  { kind: 'CUSTOMER', type: 'BUSINESS', name: 'Clinique Al Madina', ice: '002233445000016', ifNumber: '22334456', address: addr('102 boulevard d’Anfa', 'Casablanca', '20050'), email: 'gestion@clinique-almadina.ma', paymentTermDays: 45 },
  { kind: 'CUSTOMER', type: 'BUSINESS', name: 'Menuiserie Fassia SARL', ice: '001745632000028', ifNumber: '17456323', address: addr('Quartier industriel Sidi Brahim', 'Fès', '30000'), email: 'fassia.menuiserie@gmail.com' },
  { kind: 'CUSTOMER', type: 'BUSINESS', name: 'Hôtel Kasbah Tétouan', ice: '002098765000047', ifNumber: '20987654', address: addr('4 avenue Mohammed V', 'Tétouan', '93000'), email: 'reception@kasbah-tetouan.ma', paymentTermDays: 30 },
  { kind: 'CUSTOMER', type: 'BUSINESS', name: 'Coopérative Oriental Bio', ice: '001867123000059', ifNumber: '18671234', address: addr('Route de Saïdia, km 3', 'Oujda', '60000'), email: 'cooperative@orientalbio.ma' },
];

const catalogue = [
  { name: 'Conseil et audit informatique', description: 'Mission de conseil, tarif journalier', unit: 'jour', unitPrice: '3500.00', vatRate: '20' },
  { name: 'Développement d’application sur mesure', description: 'Développement logiciel, tarif journalier', unit: 'jour', unitPrice: '4200.00', vatRate: '20' },
  { name: 'Maintenance applicative mensuelle', unit: 'mois', unitPrice: '2500.00', vatRate: '20' },
  { name: 'Hébergement et nom de domaine', description: 'Forfait annuel', unit: 'an', unitPrice: '1800.00', vatRate: '20' },
  { name: 'Formation du personnel', description: 'Session de formation sur site', unit: 'jour', unitPrice: '3000.00', vatRate: '20' },
  { name: 'Licence logicielle annuelle', unit: 'unité', unitPrice: '1200.00', vatRate: '20' },
  { name: 'Switch réseau 24 ports', unit: 'unité', unitPrice: '2900.00', vatRate: '10' },
  { name: 'Câblage et accessoires réseau', unit: 'lot', unitPrice: '1450.00', vatRate: '10' },
];

type L = [item: number, qty: string, note?: string, discount?: string];
type Plan = { at: number; cust: number; lines: L[]; pay?: [afterDays: number, share: number, method?: InvoiceInput['paymentMethod']][]; draft?: boolean };

let seedState = 20260101;
const rnd = () => {
  seedState = (seedState + 0x6d2b79f5) | 0;
  let t = Math.imul(seedState ^ (seedState >>> 15), 1 | seedState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));

const notes = ['phase 1', 'phase 2', 'recette et mise en production', 'support et évolutions', 'mission de cadrage', 'développement du module de reporting', 'intégration API', 'sécurisation des accès', 'migration des données', undefined, undefined];
const terms = customers.map((c) => c.paymentTermDays ?? 60);
const methods: InvoiceInput['paymentMethod'][] = ['TRANSFER', 'TRANSFER', 'TRANSFER', 'CHEQUE', 'CASH', 'BILL_OF_EXCHANGE'];

const now = new Date();
const monthCounts = [6, 7, 8, 5, 9, 10];
const factor = [0.7, 0.8, 0.92, 0.6, 1.1, 1.25];
const drafted: Plan[] = [];
for (let k = 0; k < 6; k++) {
  const first = new Date(now.getFullYear(), now.getMonth() - 5 + k, 1);
  const last = k === 5 ? now : new Date(first.getFullYear(), first.getMonth() + 1, 0);
  const span = Math.round((last.getTime() - first.getTime()) / 86_400_000);
  const firstOffset = Math.round((first.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86_400_000);
  for (let i = 0; i < monthCounts[k]; i++) {
    const at = firstOffset + Math.min(span, Math.floor(((i + rnd()) / monthCounts[k]) * (span + 1)));
    const lines: L[] = Array.from({ length: int(1, 3) }, () => {
      const item = int(0, 7);
      const base = item >= 6 ? int(1, 6) : int(1, 8);
      return [item, String(Math.max(1, Math.round(base * factor[k]))), notes[int(0, notes.length - 1)]] as L;
    });
    drafted.push({ at: Math.min(at, 0), cust: int(0, customers.length - 1), lines });
  }
}
drafted.sort((a, b) => a.at - b.at);

const lateCount = [0, 0, 0];
drafted.forEach((p, i) => {
  const due = p.at + terms[p.cust];
  const method = methods[int(0, methods.length - 1)];
  if (due > 0) {
    if (due > 14 && i % 2 === 0) p.pay = [[int(2, 12), 1, method]];
    else if (due > 14 && i % 5 === 1) p.pay = [[int(3, 10), 0.3 + rnd() * 0.3, method]];
    return;
  }
  const late = -due;
  const bucket = late <= 30 ? 0 : late <= 60 ? 1 : late <= 90 ? 2 : -1;
  if (bucket >= 0 && lateCount[bucket] < 3) {
    if (++lateCount[bucket] % 2 === 0) p.pay = [[int(5, 15), 0.4 + rnd() * 0.3, method]];
    return;
  }
  p.pay = [[rnd() < 0.5 ? int(3, 18) : Math.max(1, terms[p.cust] + int(-20, late > 45 ? 10 : 0)), 1, method]];
});

const plans: Plan[] = [
  ...drafted,
  { at: -3, cust: 5, lines: [[1, '2', 'extension du module de facturation']], draft: true },
  { at: -1, cust: 7, lines: [[0, '3', 'accompagnement à la dématérialisation']], draft: true },
  { at: 0, cust: 12, lines: [[4, '2'], [2, '1', 'maintenance']], draft: true },
];

assertLocalDevDatabase();

const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
const tenantDb = app.get(TenantDb);
const tenant = env.tenantId;
const tx = <T>(fn: () => Promise<T>) => tenantDb.run(tenant, fn);

await wipeTenant(tenant);

const demo = { name: 'Salma Bennani', email: 'demo@tabaa.ma', password: 'tabaa-demo-2026' };
const accounts = app.get(AuthService);
const passwordHash = await accounts.hashPassword(demo.password);
await accounts.createAccount({ name: demo.name, email: demo.email, passwordHash, tenantName: 'Maghreb Digital Services', tenantId: tenant });
const team = [
  { name: 'Youssef El Amrani', email: 'membre@tabaa.ma', role: 'MEMBER' as const },
  { name: 'Nadia Berrada', email: 'lecteur@tabaa.ma', role: 'VIEWER' as const },
];
for (const m of team) await accounts.addMember({ ...m, passwordHash, tenantId: tenant });

const company = app.get(CompanyService);
const parties = app.get(PartiesService);
const items = app.get(ItemsService);
const invoices = app.get(InvoicesService);

await tx(() =>
  company.put({
    name: 'Maghreb Digital Services',
    legalForm: 'SARL',
    capital: '500000.00',
    address: addr('27 rue Abou Inane, Gauthier', 'Casablanca', '20060'),
    ice: '002876543000091',
    ifNumber: '45678123',
    rcNumber: '389214',
    rcCourt: 'Casablanca',
    tpNumber: '35192847',
    cnssNumber: '8456213',
    vatRegime: 'MONTHLY',
    vatTaxPoint: 'RECEIPTS',
    phone: '+212 5 22 36 54 10',
    email: 'contact@maghreb-digital.ma',
    bankName: 'Attijariwafa bank',
    rib: '007780000123400045678912',
    defaultPaymentTermDays: 60,
    invoiceLanguage: 'fr',
  }),
);

const partyIds: string[] = [];
for (const c of customers) partyIds.push((await tx(() => parties.create(c))).id);
const cat: Item[] = [];
for (const i of catalogue) cat.push(await tx(() => items.create(i)));

const lineOf = ([i, qty, note, discount]: L): LineInput => ({
  description: note ? `${cat[i].name} — ${note}` : cat[i].name,
  quantity: qty,
  unit: cat[i].unit,
  unitPrice: cat[i].unitPrice,
  discountPercent: discount ?? '0',
  vatRate: cat[i].vatRate,
});

for (const p of plans) {
  const input: InvoiceInput = {
    type: 'INVOICE',
    customerId: partyIds[p.cust],
    issueDate: day(p.at),
    currency: 'MAD',
    paymentMethod: 'TRANSFER',
    lines: p.lines.map(lineOf),
  };
  const draft = await tx(() => invoices.create(input));
  if (p.draft) continue;
  const issued = await tx(() => invoices.issue(draft.id));
  for (const [after, share, method] of p.pay ?? []) {
    const paidOn = day(Math.min(p.at + after, 0));
    const amount = new Decimal(issued.totals.amountDue).times(share).toDecimalPlaces(2).toFixed(2);
    await tx(() => invoices.addPayment(issued.id, { paidOn, method: method ?? 'TRANSFER', amount }));
  }
  console.log(issued.number, issued.customer.name, issued.totals.amountDue);
}

const source = (await tx(() => invoices.summaries({ state: 'ISSUED' }))).find((s) => s.paymentStatus === 'PAID')!;
const creditNote = await tx(() => invoices.creditNote(source.id));
const issuedCn = await tx(() => invoices.issue(creditNote.id));
console.log(issuedCn.number, 'avoir sur', source.number);

console.log(`\nDemo accounts (password ${demo.password}):\n  ${demo.email} (OWNER)\n  ${team.map((m) => `${m.email} (${m.role})`).join('\n  ')}`);

await app.close();
process.exit(0);
