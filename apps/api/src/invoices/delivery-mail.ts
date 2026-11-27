import type { DeliveryKind, Invoice, PaymentMethod } from '@facture/core';
import { Decimal } from 'decimal.js';
import { today } from '../common/util.js';

const METHODS: Record<PaymentMethod, { fr: string; ar: string }> = {
  TRANSFER: { fr: 'virement bancaire', ar: 'تحويل بنكي' },
  CHEQUE: { fr: 'chèque', ar: 'شيك' },
  BILL_OF_EXCHANGE: { fr: 'effet de commerce', ar: 'سفتجة' },
  CASH: { fr: 'espèces', ar: 'نقداً' },
  CARD: { fr: 'carte bancaire', ar: 'بطاقة بنكية' },
  DIRECT_DEBIT: { fr: 'prélèvement', ar: 'اقتطاع مباشر' },
};

const amount = (v: Decimal.Value, currency: string) => {
  const [int, dec] = new Decimal(v).toFixed(2).split('.');
  return `${int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')},${dec} ${currency}`;
};
const date = (iso: string) => iso.split('-').reverse().join('/');
const rib = (r: string) => (/^\d{24}$/.test(r) ? `${r.slice(0, 3)} ${r.slice(3, 6)} ${r.slice(6, 22)} ${r.slice(22)}` : r);
const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

export function remainingOf(invoice: Pick<Invoice, 'totals' | 'paidAmount'>) {
  return new Decimal(invoice.totals.amountDue).minus(invoice.paidAmount);
}

export function defaultDelivery(invoice: Invoice, kind: DeliveryKind) {
  const seller = invoice.seller!;
  const number = invoice.number!;
  const credit = invoice.type === 'CREDIT_NOTE';
  const cur = invoice.currency;
  const total = amount(invoice.totals.amountDue, cur);
  const remaining = remainingOf(invoice);
  const late = daysBetween(invoice.dueDate, today());
  const method = METHODS[invoice.paymentMethod];
  const arabic = invoice.language !== 'fr';
  const french = invoice.language !== 'ar';

  const subject =
    kind === 'REMINDER'
      ? `Rappel : facture ${number} en attente de règlement`
      : `${credit ? 'Avoir' : 'Facture'} ${number} - ${seller.name}`;

  const payFr = [
    `Mode de règlement : ${method.fr}`,
    ...(seller.bankName ? [`Banque : ${seller.bankName}`] : []),
    ...(seller.rib ? [`RIB : ${rib(seller.rib)}`] : []),
  ];
  const payAr = [
    `طريقة الأداء: ${method.ar}`,
    ...(seller.bankName ? [`البنك: ${seller.bankName}`] : []),
    ...(seller.rib ? [`الحساب البنكي (RIB): ${rib(seller.rib)}`] : []),
  ];

  const fr: string[] = ['Bonjour,', ''];
  const ar: string[] = ['مرحباً،', ''];
  if (kind === 'REMINDER') {
    const left = amount(remaining, cur);
    fr.push(
      `Sauf erreur de notre part, la facture ${number} du ${date(invoice.issueDate)} reste à régler pour un montant de ${left}.`,
      late > 0
        ? `Son échéance était fixée au ${date(invoice.dueDate)}, soit ${late} jour${late > 1 ? 's' : ''} de retard.`
        : `Son échéance est fixée au ${date(invoice.dueDate)}.`,
      'Si le règlement a été effectué entre-temps, merci de ne pas tenir compte de ce message.',
      '',
      ...payFr,
    );
    ar.push(
      `ما لم يكن هناك خطأ من جانبنا، فإن الفاتورة ${number} المؤرخة في ${date(invoice.issueDate)} لا يزال مبلغ ${left} منها مستحق الأداء.`,
      late > 0 ? `كان تاريخ الاستحقاق ${date(invoice.dueDate)}، أي بتأخر ${late} يوماً.` : `تاريخ الاستحقاق هو ${date(invoice.dueDate)}.`,
      'إذا تم الأداء في الأثناء، المرجو تجاهل هذه الرسالة.',
      '',
      ...payAr,
    );
  } else if (credit) {
    fr.push(`Veuillez trouver ci-joint l’avoir ${number} d’un montant de ${total}.`);
    ar.push(`تجدون طيه الإشعار الدائن ${number} بمبلغ ${total}.`);
  } else {
    fr.push(
      `Veuillez trouver ci-joint la facture ${number} d’un montant de ${total}, à régler avant le ${date(invoice.dueDate)}.`,
      '',
      ...payFr,
    );
    ar.push(
      `تجدون طيه الفاتورة ${number} بمبلغ ${total}، واجبة الأداء قبل ${date(invoice.dueDate)}.`,
      '',
      ...payAr,
    );
  }
  fr.push('', 'Cordialement,', seller.name);
  ar.push('', 'مع أطيب التحيات،', seller.name);

  const message = [...(french ? fr : []), ...(french && arabic ? ['', '----------', ''] : []), ...(arabic ? ar : [])].join('\n');
  return { subject, message };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const messageHtml = (message: string) =>
  `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#111;line-height:1.5">${esc(message)
    .split(/\r?\n/)
    .map((l) => (l ? `<p style="margin:0 0 4px" dir="auto">${l}</p>` : '<br>'))
    .join('')}</body></html>`;
