// Strings added for the dashboard: [français, العربية]
export const dashboard = {
  "dash.unpaidLabel": ["factures impayées", "فواتير غير مؤداة"],
  "dash.overdueLabel": ["factures en retard", "فواتير متأخرة"],
  "dash.rate": ["{n} encaissé", "{n} محصّل"],
  "dash.chartHint": ["Survolez un mois pour le détail.", "مرّر المؤشر على شهر لعرض التفاصيل."],
  "dash.openInvoice": ["Ouvrir la facture", "فتح الفاتورة"],
} as const satisfies Record<string, readonly [string, string]>;
