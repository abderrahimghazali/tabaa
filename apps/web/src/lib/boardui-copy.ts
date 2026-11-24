import type { Locale } from "./format";

// English strings baked into BoardUI components, mapped to [français, العربية].
// Our own copy goes through lib/i18n.ts; this only covers what the source ships with.
const COPY: Record<string, [string, string]> = {
  "Quick Search": ["Recherche rapide", "بحث سريع"],
  "No results": ["Aucun résultat", "لا توجد نتائج"],
  "Command palette": ["Recherche rapide", "بحث سريع"],
  "Type a command or search…": ["Chercher une facture, un client ou une action", "ابحث عن فاتورة أو زبون أو إجراء"],
  Navigate: ["Naviguer", "تنقل"],
  Select: ["Choisir", "اختيار"],
  Close: ["Fermer", "إغلاق"],
  Clear: ["Effacer", "مسح"],
  Previous: ["Précédent", "السابق"],
  Next: ["Suivant", "التالي"],
  Loading: ["Chargement", "جارٍ التحميل"],
  Search: ["Rechercher", "بحث"],
  Breadcrumb: ["Fil d'Ariane", "مسار التنقل"],
};

export function boardCopy(text: string, locale: Locale): string {
  const hit = COPY[text];
  return hit ? hit[locale === "ar" ? 1 : 0] : text;
}
