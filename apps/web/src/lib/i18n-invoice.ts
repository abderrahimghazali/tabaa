// Strings added for the invoice screens: [français, العربية]
export const invoice = {
  "editor.noMatch": ["Aucun article du catalogue. Votre saisie est conservée.", "لا يوجد منتج مطابق في الكتالوج. سيتم الاحتفاظ بما كتبته."],
  "editor.lineN": ["Ligne {n}", "البند {n}"],
  "detail.progress": ["Part encaissée", "النسبة المحصّلة"],
  "editor.dateLabel": ["Date", "التاريخ"],
} as const satisfies Record<string, readonly [string, string]>;
