import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

const file = resolve(import.meta.dirname, '../../../.env');
if (existsSync(file)) process.loadEnvFile(file);

const url = z.string().min(1).pipe(z.url());

const Schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  DATABASE_URL: url,
  APP_DATABASE_URL: url,
  AUTH_DATABASE_URL: url,
  WEB_URL: url,
  INTERNAL_API_TOKEN: z.string().min(16),
  SMTP_URL: z.string().min(1).pipe(z.url()),
  MAIL_FROM: z.string().min(3),
  REDIS_URL: z.string().optional(),
  MFA_ENCRYPTION_KEY: z.string().refine((v) => Buffer.from(v, 'base64').length === 32, 'must be 32 random bytes, base64'),
  API_PORT: z.coerce.number().int().default(4100),
  DEV_TENANT_ID: z.string().optional(),
});

export function parseEnv(source: Record<string, string | undefined>) {
  const parsed = Schema.safeParse(source);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment, the API cannot start:\n${lines.join('\n')}`);
  }
  const e = parsed.data;
  if (e.NODE_ENV === 'production') {
    const problems: string[] = [];
    if (['localhost', '127.0.0.1', '::1', '[::1]'].includes(new URL(e.SMTP_URL).hostname)) problems.push('SMTP_URL must not point at localhost in production');
    if (!e.REDIS_URL) problems.push('REDIS_URL is required in production');
    // The values shipped in .env.example are public; refuse to run on them.
    const placeholder = (v: string) => v.includes('change-me') || Buffer.from(v, 'base64').toString('latin1').includes('change-me');
    for (const [name, value] of Object.entries({
      INTERNAL_API_TOKEN: e.INTERNAL_API_TOKEN,
      MFA_ENCRYPTION_KEY: e.MFA_ENCRYPTION_KEY,
      APP_DATABASE_URL: e.APP_DATABASE_URL,
      AUTH_DATABASE_URL: e.AUTH_DATABASE_URL,
    })) {
      if (placeholder(value)) problems.push(`${name} still has its example value`);
    }
    if (problems.length) throw new Error(`Invalid environment, the API cannot start:\n  ${problems.join('\n  ')}`);
  }
  return {
    nodeEnv: e.NODE_ENV,
    adminUrl: e.DATABASE_URL,
    appUrl: e.APP_DATABASE_URL,
    authUrl: e.AUTH_DATABASE_URL,
    webUrl: e.WEB_URL,
    internalToken: e.INTERNAL_API_TOKEN,
    smtpUrl: e.SMTP_URL,
    mailFrom: e.MAIL_FROM,
    redisUrl: e.NODE_ENV === 'test' ? undefined : e.REDIS_URL,
    mfaKey: e.MFA_ENCRYPTION_KEY,
    port: e.API_PORT,
    tenantId: e.DEV_TENANT_ID ?? '',
  };
}

export const env = parseEnv(process.env);
