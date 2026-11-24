// Strings added for the settings screens: [français, العربية]
export const settings = {
  "settings.subtitle": ["Votre entreprise, la facturation et l'interface.", "مقاولتك والفوترة وواجهة التطبيق."],
  "settings.tabsLabel": ["Sections des paramètres", "أقسام الإعدادات"],
  "settings.saved": ["Paramètres enregistrés", "تم حفظ الإعدادات"],
  "settings.legalForms": ["Formes juridiques courantes", "الأشكال القانونية الشائعة"],
  "settings.billing.defaultsTitle": ["Valeurs par défaut", "القيم الافتراضية"],
  "settings.billing.defaultsHint": ["Proposées sur chaque nouvelle facture. Vous pouvez les modifier facture par facture.", "تُقترح في كل فاتورة جديدة ويمكنك تعديلها لكل فاتورة."],
  "settings.billing.numberingTitle": ["Numérotation", "الترقيم"],
  "settings.billing.numberingHint": ["Attribuée automatiquement, en lecture seule.", "تُمنح تلقائيًا للقراءة فقط."],
  "settings.billing.numberingInvoices": ["Factures et acomptes", "الفواتير وفواتير التسبيق"],
  "settings.billing.numberingCredits": ["Avoirs", "الإشعارات الدائنة"],
  "settings.billing.numberingExplain": [
    "Une seule séquence continue par entreprise, par type de document et par année. Le numéro est attribué à l'émission : un brouillon n'en a pas, et aucun numéro n'est sauté.",
    "تسلسل واحد متصل لكل مقاولة ونوع مستند وسنة. يُمنح الرقم عند الإصدار: لا رقم للمسودة ولا يُتخطى أي رقم.",
  ],
  "settings.prefs.languageTitle": ["Langue de l'interface", "لغة الواجهة"],
  "settings.prefs.languageHint": ["S'applique à tous les écrans. La langue des factures se règle dans Facturation.", "تسري على كل الشاشات. أما لغة الفواتير فتُضبط في الفوترة."],
  "settings.prefs.digits": ["Les chiffres, les montants et les identifiants restent en chiffres occidentaux (0-9), lus de gauche à droite, dans les deux langues.", "تبقى الأرقام والمبالغ والمعرّفات بالأرقام الغربية (0-9) وتُقرأ من اليسار إلى اليمين في اللغتين."],
  "settings.prefs.fr": ["Français", "Français"],
  "settings.prefs.ar": ["العربية", "العربية"],
} as const satisfies Record<string, readonly [string, string]>;
