// Strings added for the list screens: [français, العربية]
export const lists = {
  "lists.allStatuses": ["Tous les statuts", "كل الحالات"],
  "lists.allCustomers": ["Tous les clients", "كل الزبناء"],
  "lists.allPeriods": ["Toutes les périodes", "كل الفترات"],
  "lists.allTypes": ["Tous les types", "كل الأنواع"],
  "lists.invoicesTable": ["Liste des factures", "قائمة الفواتير"],
  "lists.customersTable": ["Liste des clients", "قائمة الزبناء"],
  "lists.itemsTable": ["Catalogue d'articles", "كتالوج المنتجات"],
  "lists.pagination": ["Pagination", "ترقيم الصفحات"],
  "lists.clearSearch": ["Effacer la recherche", "مسح البحث"],
  "lists.sortBy": ["Trier par {col}", "الترتيب حسب {col}"],
  "lists.edit": ["Modifier", "تعديل"],
  "lists.deleteConfirm": ["Supprimer", "حذف"],
  "lists.vatRate": ["Taux de TVA", "نسبة الضريبة"],
  "lists.formIssues": ["Le formulaire contient des erreurs.", "يحتوي النموذج على أخطاء."],
} as const satisfies Record<string, readonly [string, string]>;
