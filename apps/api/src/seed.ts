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
import { BankService } from './bank/bank.service.js';
import { PurchasesService } from './purchases/purchases.service.js';

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

// Second workspace: demo@ is its OWNER and comptable@ its ACCOUNTANT, so wipe it first (shared accounts survive a wipe).
const tenant2 = `${tenant.slice(0, -4)}f002`;
const tx2 = <T>(fn: () => Promise<T>) => tenantDb.run(tenant2, fn);
await wipeTenant(tenant2);
await wipeTenant(tenant);

const demo = { name: 'Salma Bennani', email: 'demo@tabaa.ma', password: 'tabaa-demo-2026' };
const accounts = app.get(AuthService);
const passwordHash = await accounts.hashPassword(demo.password);
const { userId: demoId } = await accounts.createAccount({ name: demo.name, email: demo.email, passwordHash, tenantName: 'Maghreb Digital Services', tenantId: tenant });
const team = [
  { name: 'Youssef El Amrani', email: 'membre@tabaa.ma', role: 'MEMBER' as const },
  { name: 'Nadia Berrada', email: 'lecteur@tabaa.ma', role: 'VIEWER' as const },
  { name: 'Karim Tazi', email: 'comptable@tabaa.ma', role: 'ACCOUNTANT' as const },
];
const memberIds: Record<string, string> = {};
for (const m of team) memberIds[m.email] = await accounts.addMember({ ...m, passwordHash, tenantId: tenant });

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
    vatBasis: 'CASH',
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
    await tx(() => invoices.addPayment(issued.id, { paidOn, method: method ?? 'TRANSFER', amount, vatWithheld: '0', taxWithheld: '0' }));
  }
  console.log(issued.number, issued.customer.name, issued.totals.amountDue);
}

const source = (await tx(() => invoices.summaries({ state: 'ISSUED' }))).find((s) => s.paymentStatus === 'PAID')!;
const creditNote = await tx(() => invoices.creditNote(source.id));
const issuedCn = await tx(() => invoices.issue(creditNote.id));
console.log(issuedCn.number, 'avoir sur', source.number);

// One bank statement for the main workspace, built from the open invoices so that each kind of suggestion shows up.
{
  const bank = app.get(BankService);
  const open = (await tx(() => invoices.summaries({ state: 'ISSUED' }))).filter((s) => s.type === 'INVOICE' && s.paymentStatus === 'UNPAID');
  const [byNumber, byAmount, byName, toMatch] = [open.slice(0, 5), open.slice(5, 9), open[9], open.slice(10, 12)];
  const nameOf = async (id: string) => (await tx(() => invoices.get(id))).customer.name.replace(/\s+(SARL|SA|SAS)$/i, '').toUpperCase();
  const lines: { date: string; label: string; amount: string; reference?: string }[] = [
    ...byNumber.map((s, i) => ({ date: day(-2 - i), label: `VIR RECU ${s.number} REGLEMENT FACTURE`, amount: s.amountDue })),
    ...byAmount.map((s, i) => ({ date: day(-3 - i), label: `VIREMENT RECU CLIENT ${1000 + i * 7}`, amount: s.amountDue, reference: `REF${88120 + i}` })),
    { date: day(-9), label: `VIR ${await nameOf(byName.id)} ACOMPTE TRAVAUX`, amount: '1234.56' },
    ...toMatch.map((s, i) => ({ date: day(-12 - i), label: `VIR RECU ${s.number}`, amount: s.amountDue })),
    { date: day(-1), label: 'COMMISSION TENUE DE COMPTE', amount: '-45.00' },
    { date: day(-4), label: 'FRAIS VIREMENT PERMANENT', amount: '-12.00' },
    { date: day(-5), label: 'CHEQUE 0001234 FOURNISSEUR PAPETERIE', amount: '-8500.00', reference: '0001234' },
    { date: day(-6), label: 'PRELEVEMENT CNSS NOVEMBRE', amount: '-12450.00' },
    { date: day(-7), label: 'LOYER BUREAU NOVEMBRE', amount: '-9000.00' },
    { date: day(-8), label: 'PAIEMENT FOURNISSEUR SOMAFRAIS', amount: '-3200.00' },
    { date: day(-10), label: 'ABONNEMENT TELEPHONIE PROFESSIONNELLE', amount: '-690.00' },
    { date: day(-11), label: 'VIREMENT INTERNE COMPTE EPARGNE', amount: '20000.00' },
    { date: day(-13), label: 'REMISE CHEQUE 7781234 CLIENT NON IDENTIFIE', amount: '4100.00', reference: '7781234' },
    { date: day(-14), label: 'VIR RECU DIVERS', amount: '2750.00' },
    { date: day(-15), label: 'FRAIS DE TENUE DE COMPTE T3', amount: '-135.00' },
    { date: day(-16), label: 'VIR RECU DIVERS', amount: '2750.00' },
  ];
  const imp = await tx(() => bank.importLines({ fileName: 'releve-novembre-2026.csv', accountLabel: 'Attijariwafa 0001', lines }));
  const found = (await tx(() => bank.list({ importId: imp.id, page: 1, pageSize: 100 }))).items;
  for (const s of toMatch) {
    const line = found.find((l) => l.label === `VIR RECU ${s.number}`)!;
    await tx(() => bank.match(line.id, { method: 'TRANSFER', allocations: [{ invoiceId: s.id, amount: s.amountDue }] }));
  }
  await tx(() => bank.setIgnored(found.find((l) => l.label.startsWith('VIREMENT INTERNE'))!.id, true));
  console.log(`Relevé bancaire: ${imp.lineCount} lignes (${toMatch.length} rapprochées, 1 ignorée)`);

  // Sales that exercise the VAT statement: withholding by customers, a partial payment at 10 %, an exempt sale.
  const forfait = (price: string, vatRate: string, what: string): LineInput => ({ description: what, quantity: '1', unit: 'forfait', unitPrice: price, discountPercent: '0', vatRate });
  const sale = async (cust: number, at: number, line: LineInput, pays: { after: number; amount: string; vatWithheld?: string; taxWithheld?: string }[]) => {
    const d = await tx(() => invoices.create({ type: 'INVOICE', customerId: partyIds[cust], issueDate: day(at), currency: 'MAD', paymentMethod: 'TRANSFER', lines: [line] }));
    const issued = await tx(() => invoices.issue(d.id));
    for (const p of pays) await tx(() => invoices.addPayment(issued.id, { paidOn: day(Math.min(at + p.after, 0)), method: 'TRANSFER', amount: p.amount, vatWithheld: p.vatWithheld ?? '0', taxWithheld: p.taxWithheld ?? '0' }));
  };
  await sale(7, -25, forfait('37500.00', '20', 'Assistance à la dématérialisation, marché public'), [{ after: 15, amount: '39375.00', vatWithheld: '5625.00' }]);
  await sale(10, -40, forfait('20000.00', '20', 'Audit de sécurité'), [{ after: 5, amount: '20000.00', vatWithheld: '3000.00', taxWithheld: '1000.00' }]);
  await sale(9, -12, forfait('8000.00', '0', 'Prestation exportée, exonérée'), [{ after: 9, amount: '8000.00' }]);
  await sale(1, -30, forfait('6000.00', '10', 'Formation, taux réduit'), [{ after: 10, amount: '3300.00' }]);
}

await accounts.createTenant({ id: tenant2, name: 'Atelier Zellige Fès SARL' });
await accounts.addMembership(demoId, tenant2, 'OWNER');
await accounts.addMembership(memberIds['comptable@tabaa.ma'], tenant2, 'ACCOUNTANT');
await tx2(() =>
  company.put({
    name: 'Atelier Zellige Fès SARL',
    legalForm: 'SARL',
    capital: '100000.00',
    address: addr('14 derb Lahlou, Fès el-Bali', 'Fès', '30000'),
    ice: '002455667000013',
    ifNumber: '33445566',
    rcNumber: '41207',
    rcCourt: 'Fès',
    tpNumber: '14002233',
    cnssNumber: '7120456',
    vatRegime: 'QUARTERLY',
    vatBasis: 'CASH',
    vatTaxPoint: 'RECEIPTS',
    phone: '+212 5 35 63 20 18',
    email: 'atelier@zellige-fes.ma',
    bankName: 'Banque Populaire',
    rib: '181780000123400045678934',
    defaultPaymentTermDays: 30,
    invoiceLanguage: 'fr',
  }),
);
const fesCustomers: PartyInput[] = [
  { kind: 'CUSTOMER', type: 'BUSINESS', name: 'Riad Dar Batha', ice: '002300450000067', ifNumber: '23004507', address: addr('3 derb Batha, Médina', 'Fès', '30200'), email: 'contact@riad-darbatha.ma' },
  { kind: 'CUSTOMER', type: 'BUSINESS', name: 'Hôtel Palais Jamaï', ice: '001988776000021', ifNumber: '19887760', address: addr('Bab Guissa', 'Fès', '30000'), email: 'achats@palais-jamai.ma', paymentTermDays: 45 },
  { kind: 'CUSTOMER', type: 'BUSINESS', name: 'Décor Méditerranée SARL', ice: '002101234000052', ifNumber: '21012349', address: addr('Zone industrielle Bouznika', 'Bouznika', '13500'), email: 'compta@decor-med.ma' },
];
const fesIds: string[] = [];
for (const c of fesCustomers) fesIds.push((await tx2(() => parties.create(c))).id);
const zellige = (qty: string, price: string, what: string): LineInput => ({ description: what, quantity: qty, unit: 'm²', unitPrice: price, discountPercent: '0', vatRate: '20' });
const fesPlans: [cust: number, at: number, lines: LineInput[], paid?: number][] = [
  [0, -50, [zellige('18', '650.00', 'Zellige traditionnel, patio')], 1],
  [1, -34, [zellige('42', '720.00', 'Zellige émaillé, salon et hammam')], 0.5],
  [2, -20, [zellige('25', '580.00', 'Fontaine et vasque en zellige')]],
  [0, -6, [zellige('9', '690.00', 'Rénovation d’une niche murale')]],
];
for (const [cust, at, lines, paid] of fesPlans) {
  const d = await tx2(() => invoices.create({ type: 'INVOICE', customerId: fesIds[cust], issueDate: day(at), currency: 'MAD', paymentMethod: 'TRANSFER', lines }));
  const done = await tx2(() => invoices.issue(d.id));
  if (paid) {
    const amount = new Decimal(done.totals.amountDue).times(paid).toDecimalPlaces(2).toFixed(2);
    await tx2(() => invoices.addPayment(done.id, { paidOn: day(at + 10), method: 'TRANSFER', amount, vatWithheld: '0', taxWithheld: '0' }));
  }
  console.log(done.number, done.customer.name, done.totals.amountDue, '(Fès)');
}
await tx2(() => invoices.create({ type: 'INVOICE', customerId: fesIds[1], issueDate: day(0), currency: 'MAD', paymentMethod: 'TRANSFER', lines: [zellige('12', '720.00', 'Zellige émaillé, terrasse')] }));

// Supplier invoices: suppliers and a spread of purchase invoices in every state, for both workspaces.
{
  const purchases = app.get(PurchasesService);
  type Run = <T>(fn: () => Promise<T>) => Promise<T>;
  const supplier = (run: Run, name: string, ice: string | undefined, kind: 'SUPPLIER' | 'BOTH', city: string, email?: string) =>
    run(() => parties.create({ kind, type: 'BUSINESS', name, ...(ice && { ice, ifNumber: ice.slice(2, 10) }), address: addr(`${int(2, 90)} rue de l’Industrie`, city, '20000'), ...(email && { email }) })).then((p) => p.id);
  const vl = (rate: string, net: string) => ({ vatRate: rate, net, vat: new Decimal(net).times(rate).div(100).toFixed(2) });
  type Spec = {
    s: number;
    cat?: 'GOODS' | 'SERVICES' | 'FIXED_ASSET';
    at: number;
    term: number;
    lines: [rate: string, net: string][];
    flow: 'paid' | 'partial' | 'unpaid' | 'toApprove' | 'rejected' | 'disputed' | 'fees' | 'feesVat' | 'cash';
    deductible?: boolean;
    // Absolute payment day (days from today) when the default is not what the report should show.
    payAt?: number;
    desc: string;
  };
  const build = async (run: Run, ids: string[], specs: Spec[], prefix: string) => {
    let n = 0;
    for (const sp of specs) {
      const gross = (l: Spec['lines']) => l.reduce((a, [r, net]) => a.plus(net).plus(vl(r, net).vat), new Decimal(0));
      const p = await run(() =>
        purchases.create({
          supplierId: ids[sp.s],
          number: `${prefix}${String(++n).padStart(4, '0')}`,
          issueDate: day(sp.at),
          dueDate: day(sp.at + sp.term),
          category: sp.cat ?? 'SERVICES',
          description: sp.desc,
          vatLines: sp.lines.map(([r, net]) => vl(r, net)),
          vatDeductible: sp.deductible ?? true,
        }),
      );
      if (sp.flow === 'toApprove') continue;
      if (sp.flow === 'rejected') {
        await run(() => purchases.reject(p.id, { reason: 'Doublon : déjà reçue le mois dernier avec un autre numéro.' }));
        continue;
      }
      await run(() => purchases.approve(p.id));
      const total = gross(sp.lines);
      const on = (after: number) => day(Math.min(sp.payAt ?? sp.at + after, 0));
      const pay = (after: number, amount: Decimal.Value, extra: Record<string, string> = {}, method: 'TRANSFER' | 'CASH' | 'CHEQUE' = 'TRANSFER') =>
        run(() => purchases.addPayment(p.id, { paidOn: on(after), method, amount: new Decimal(amount).toFixed(2), vatWithheld: '0', taxWithheld: '0', ...extra }));
      const vatTotal = new Decimal(p.totalVat);
      const net = new Decimal(p.totalNet);
      if (sp.flow === 'paid') await pay(sp.term - 3, total);
      else if (sp.flow === 'partial') await pay(sp.term, total.times(0.5));
      else if (sp.flow === 'disputed') await run(() => purchases.dispute(p.id, { disputed: true }));
      else if (sp.flow === 'fees') {
        const vatW = vatTotal.times(0.75);
        const feeW = net.times(0.1);
        await pay(sp.term, total.minus(vatW).minus(feeW), { vatWithheld: vatW.toFixed(2), taxWithheld: feeW.toFixed(2), reference: 'VIR RETENUES' });
      } else if (sp.flow === 'feesVat') {
        const vatW = vatTotal.times(0.75);
        await pay(sp.term - 5, total.minus(vatW), { vatWithheld: vatW.toFixed(2), reference: 'VIR RETENUE TVA' });
      } else if (sp.flow === 'cash') {
        await pay(5, 4800, { reference: 'ESPECES' }, 'CASH');
        await pay(5, 4800, { reference: 'ESPECES 2' }, 'CASH');
      }
    }
  };

  const main = [
    await supplier(tx, 'Maroc Télécom Business', '001245678000022', 'SUPPLIER', 'Rabat', 'entreprises@iam.example.ma'),
    await supplier(tx, 'Papeterie Centrale SARL', '001934561000077', 'SUPPLIER', 'Casablanca'),
    await supplier(tx, 'Dell Maroc SA', '000987654000031', 'SUPPLIER', 'Casablanca'),
    await supplier(tx, 'Cabinet Conseil Idrissi', '002113344000085', 'SUPPLIER', 'Rabat'),
    await supplier(tx, 'Ateliers Bennis', undefined, 'SUPPLIER', 'Salé'),
    await supplier(tx, 'Rabat Énergie Services', '001778899000046', 'SUPPLIER', 'Rabat'),
    await supplier(tx, 'Coopérative Oriental Bio', '001867123000059', 'BOTH', 'Oujda'),
  ];
  await build(tx, main, [
    { s: 0, at: -110, term: 30, lines: [['20', '1250.00']], flow: 'paid', desc: 'Abonnement télécom et internet, juillet' },
    { s: 0, at: -80, term: 30, lines: [['20', '1250.00']], flow: 'paid', desc: 'Abonnement télécom et internet, août' },
    { s: 0, at: -50, term: 30, lines: [['20', '1300.00']], flow: 'unpaid', desc: 'Abonnement télécom et internet, septembre' },
    { s: 1, cat: 'GOODS', at: -100, term: 30, lines: [['20', '840.00']], flow: 'paid', payAt: -12, desc: 'Fournitures de bureau' },
    { s: 1, cat: 'GOODS', at: -60, term: 45, lines: [['20', '2200.00']], flow: 'partial', desc: 'Papier et consommables d’impression' },
    { s: 2, cat: 'FIXED_ASSET', at: -90, term: 60, lines: [['20', '28000.00']], flow: 'partial', desc: 'Dix ordinateurs portables' },
    { s: 2, cat: 'FIXED_ASSET', at: -30, term: 150, lines: [['20', '12500.00']], flow: 'toApprove', desc: 'Serveur de sauvegarde' },
    { s: 3, at: -95, term: 30, lines: [['20', '8000.00']], flow: 'fees', payAt: -18, desc: 'Mission de conseil juridique' },
    { s: 3, at: -65, term: 30, lines: [['20', '6000.00']], flow: 'fees', desc: 'Audit des contrats clients' },
    { s: 3, at: -20, term: 30, lines: [['20', '5000.00']], flow: 'toApprove', desc: 'Assistance à la rédaction des CGV' },
    { s: 4, cat: 'GOODS', at: -70, term: 30, lines: [['20', '1000.00'], ['10', '400.00']], flow: 'unpaid', desc: 'Travaux d’aménagement et petit matériel' },
    { s: 4, cat: 'GOODS', at: -40, term: 30, lines: [['0', '3000.00']], flow: 'paid', desc: 'Matériel exonéré' },
    { s: 4, at: -5, term: 45, lines: [['20', '600.00']], flow: 'unpaid', desc: 'Entretien des locaux' },
    { s: 5, cat: 'GOODS', at: -55, term: 30, lines: [['20', '12000.00']], flow: 'cash', desc: 'Groupe électrogène et installation' },
    { s: 5, at: -45, term: 30, lines: [['20', '3000.00']], flow: 'unpaid', desc: 'Contrat de maintenance électrique' },
    { s: 6, cat: 'GOODS', at: -35, term: 30, lines: [['10', '5000.00']], flow: 'disputed', desc: 'Produits bio pour la cafétéria' },
    { s: 1, cat: 'GOODS', at: -25, term: 30, lines: [['20', '450.00']], flow: 'rejected', desc: 'Fournitures de bureau (doublon)' },
    { s: 1, at: -15, term: 30, lines: [['20', '700.00']], flow: 'unpaid', deductible: false, desc: 'Cadeaux clients, TVA non récupérable' },
    { s: 0, at: -20, term: 30, lines: [['20', '1250.00']], flow: 'paid', payAt: -5, desc: 'Abonnement télécom et internet, novembre' },
    { s: 1, cat: 'GOODS', at: -25, term: 30, lines: [['20', '900.00']], flow: 'paid', payAt: -10, desc: 'Cartouches et classeurs' },
    { s: 4, cat: 'GOODS', at: -100, term: 30, lines: [['20', '1500.00']], flow: 'unpaid', desc: 'Mobilier de bureau (impayé depuis plus de 60 jours)' },
    { s: 2, cat: 'GOODS', at: -150, term: 200, lines: [['20', '7000.00']], flow: 'unpaid', desc: 'Licences et écrans, délai convenu de 200 jours' },
  ], 'ACH-');
  console.log(`Factures d’achat: 22 (${main.length} fournisseurs, dont un sans ICE et un client-fournisseur), 3 à Fès`);

  const fes = [
    await supplier(tx2, 'Argile et Émaux du Rif', '002001122000093', 'SUPPLIER', 'Nador'),
    await supplier(tx2, 'Transports Chaouia', undefined, 'SUPPLIER', 'Fès'),
  ];
  await build(tx2, fes, [
    { s: 0, cat: 'GOODS', at: -60, term: 30, lines: [['20', '9000.00']], flow: 'paid', desc: 'Argile et émaux, lot d’automne' },
    { s: 1, at: -20, term: 30, lines: [['20', '1500.00']], flow: 'toApprove', desc: 'Livraison de carreaux, Marrakech' },
    { s: 0, cat: 'GOODS', at: -35, term: 30, lines: [['20', '4200.00']], flow: 'partial', desc: 'Pigments et colles' },
  ], 'F-');
}

console.log(`\nDemo accounts (password ${demo.password}):\n  ${demo.email} (OWNER, also OWNER of Atelier Zellige Fès SARL)\n  ${team.map((m) => `${m.email} (${m.role})`).join('\n  ')}`);

await app.close();
process.exit(0);
