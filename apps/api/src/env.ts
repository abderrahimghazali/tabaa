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
  return {
    nodeEnv: e.NODE_ENV,
    adminUrl: e.DATABASE_URL,
    appUrl: e.APP_DATABASE_URL,
    authUrl: e.AUTH_DATABASE_URL,
    webUrl: e.WEB_URL,
    internalToken: e.INTERNAL_API_TOKEN,
    port: e.API_PORT,
    tenantId: e.DEV_TENANT_ID ?? '',
  };
}

export const env = parseEnv(process.env);
