import { env } from '../env.js';

interface Block {
  title: string;
  lines: string[];
  action?: { label: string; url: string };
}
interface Content {
  subject: string;
  fr: Block;
  ar: Block;
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const htmlBlock = (b: Block) =>
  `<h2 style="font-size:18px;margin:0 0 12px">${esc(b.title)}</h2>` +
  b.lines.map((l) => `<p style="margin:0 0 12px">${esc(l)}</p>`).join('') +
  (b.action
    ? `<p style="margin:0 0 12px"><a href="${esc(b.action.url)}">${esc(b.action.label)}</a></p><p style="margin:0 0 12px;color:#555;font-size:13px">${esc(b.action.url)}</p>`
    : '');

const textBlock = (b: Block) =>
  [b.title, '', ...b.lines, ...(b.action ? ['', `${b.action.label} : ${b.action.url}`] : [])].join('\n');

export function render(c: Content) {
  const html =
    `<!doctype html><html lang="fr"><body style="font-family:Arial,sans-serif;color:#111;line-height:1.5;max-width:560px;margin:0 auto;padding:16px">` +
    htmlBlock(c.fr) +
    `<hr style="border:0;border-top:1px solid #ddd;margin:24px 0">` +
    `<div dir="rtl" lang="ar" style="text-align:right">${htmlBlock(c.ar)}</div></body></html>`;
  const text = `${textBlock(c.fr)}\n\n----------\n\n${textBlock(c.ar)}\n`;
  return { subject: c.subject, html, text };
}

const web = (path: string) => `${env.webUrl}${path}`;

export interface TemplateData {
  verifyEmail: { name: string; token: string };
  accountExists: { name: string };
  passwordReset: { url: string };
  passwordChanged: { name: string };
  mfaEnabled: { name: string };
  mfaDisabled: { name: string };
  workspaceClosed: { name: string; workspace: string };
}

export type TemplateName = keyof TemplateData;

export const templates: { [K in TemplateName]: (d: TemplateData[K]) => Content } = {
  verifyEmail: ({ name, token }) => {
    const url = web(`/verification?token=${encodeURIComponent(token)}`);
    return {
      subject: 'Confirmez votre adresse e-mail | تأكيد بريدك الإلكتروني',
      fr: {
        title: 'Confirmez votre adresse e-mail',
        lines: [`Bonjour ${name},`, 'Cliquez sur le lien ci-dessous pour activer votre compte Tabaa. Il est valable 24 heures et ne fonctionne qu’une fois.', 'Si vous n’êtes pas à l’origine de cette demande, ignorez ce message.'],
        action: { label: 'Confirmer mon adresse', url },
      },
      ar: {
        title: 'تأكيد عنوان بريدك الإلكتروني',
        lines: [`مرحباً ${name}،`, 'انقر على الرابط أدناه لتفعيل حسابك في طباعة. الرابط صالح لمدة 24 ساعة ويُستعمل مرة واحدة فقط.', 'إذا لم تكن أنت من طلب ذلك، تجاهل هذه الرسالة.'],
        action: { label: 'تأكيد عنواني', url },
      },
    };
  },
  accountExists: ({ name }) => ({
    subject: 'Un compte existe déjà | يوجد حساب بهذا البريد',
    fr: {
      title: 'Un compte existe déjà avec cette adresse',
      lines: [`Bonjour ${name},`, 'Quelqu’un a demandé la création d’un compte Tabaa avec votre adresse, mais elle est déjà utilisée. Si c’était vous, connectez-vous ou réinitialisez votre mot de passe. Sinon, ignorez ce message.'],
      action: { label: 'Se connecter', url: web('/connexion') },
    },
    ar: {
      title: 'يوجد حساب بهذا العنوان بالفعل',
      lines: [`مرحباً ${name}،`, 'طلب شخص ما إنشاء حساب في طباعة بعنوانك، لكنه مستعمل بالفعل. إذا كنت أنت، سجّل الدخول أو أعد تعيين كلمة المرور. وإلا فتجاهل هذه الرسالة.'],
      action: { label: 'تسجيل الدخول', url: web('/connexion') },
    },
  }),
  passwordReset: ({ url }) => ({
    subject: 'Réinitialisation de votre mot de passe | إعادة تعيين كلمة المرور',
    fr: {
      title: 'Réinitialisez votre mot de passe',
      lines: ['Vous avez demandé à réinitialiser votre mot de passe. Le lien ci-dessous est valable 1 heure et ne fonctionne qu’une fois.', 'Si vous n’êtes pas à l’origine de cette demande, ignorez ce message : votre mot de passe reste inchangé.'],
      action: { label: 'Choisir un nouveau mot de passe', url },
    },
    ar: {
      title: 'إعادة تعيين كلمة المرور',
      lines: ['لقد طلبت إعادة تعيين كلمة المرور. الرابط أدناه صالح لمدة ساعة واحدة ويُستعمل مرة واحدة فقط.', 'إذا لم تكن أنت من طلب ذلك، تجاهل هذه الرسالة وستبقى كلمة المرور كما هي.'],
      action: { label: 'اختيار كلمة مرور جديدة', url },
    },
  }),
  passwordChanged: ({ name }) => ({
    subject: 'Votre mot de passe a été modifié | تم تغيير كلمة المرور',
    fr: {
      title: 'Mot de passe modifié',
      lines: [`Bonjour ${name},`, 'Le mot de passe de votre compte Tabaa vient d’être modifié et vos sessions ont été fermées. Si ce n’était pas vous, réinitialisez-le immédiatement.'],
      action: { label: 'Réinitialiser mon mot de passe', url: web('/mot-de-passe-oublie') },
    },
    ar: {
      title: 'تم تغيير كلمة المرور',
      lines: [`مرحباً ${name}،`, 'تم تغيير كلمة مرور حسابك للتو وأُغلقت جميع جلساتك. إذا لم تكن أنت، أعد تعيينها فوراً.'],
      action: { label: 'إعادة تعيين كلمة المرور', url: web('/mot-de-passe-oublie') },
    },
  }),
  mfaEnabled: ({ name }) => ({
    subject: 'Double authentification activée | تم تفعيل التحقق بخطوتين',
    fr: { title: 'Double authentification activée', lines: [`Bonjour ${name},`, 'La double authentification est maintenant active sur votre compte. Conservez vos codes de secours en lieu sûr. Si ce n’était pas vous, changez votre mot de passe immédiatement.'] },
    ar: { title: 'تم تفعيل التحقق بخطوتين', lines: [`مرحباً ${name}،`, 'تم تفعيل التحقق بخطوتين على حسابك. احتفظ برموز الاسترداد في مكان آمن. إذا لم تكن أنت، غيّر كلمة المرور فوراً.'] },
  }),
  mfaDisabled: ({ name }) => ({
    subject: 'Double authentification désactivée | تم إيقاف التحقق بخطوتين',
    fr: { title: 'Double authentification désactivée', lines: [`Bonjour ${name},`, 'La double authentification a été désactivée sur votre compte. Si ce n’était pas vous, changez votre mot de passe immédiatement.'] },
    ar: { title: 'تم إيقاف التحقق بخطوتين', lines: [`مرحباً ${name}،`, 'تم إيقاف التحقق بخطوتين على حسابك. إذا لم تكن أنت، غيّر كلمة المرور فوراً.'] },
  }),
  workspaceClosed: ({ name, workspace }) => ({
    subject: 'Espace de travail fermé | تم إغلاق مساحة العمل',
    fr: {
      title: 'Votre espace de travail est fermé',
      lines: [`Bonjour ${name},`, `L’espace « ${workspace} » a été fermé. Les comptes utilisateurs et les données non soumises à conservation légale sont supprimés. Les factures émises sont conservées, verrouillées, pendant la durée légale, puis supprimées.`],
    },
    ar: {
      title: 'تم إغلاق مساحة العمل',
      lines: [`مرحباً ${name}،`, `تم إغلاق مساحة «${workspace}». حُذفت حسابات المستخدمين والبيانات غير الخاضعة للحفظ القانوني. تُحفظ الفواتير الصادرة مقفلة طوال المدة القانونية ثم تُحذف.`],
    },
  }),
};

export function buildMail<K extends TemplateName>(name: K, data: TemplateData[K]) {
  return render((templates[name] as (d: TemplateData[K]) => Content)(data));
}
