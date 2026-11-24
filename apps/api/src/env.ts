import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const file = resolve(import.meta.dirname, '../../../.env');
if (existsSync(file)) process.loadEnvFile(file);

const adminUrl = process.env.DATABASE_URL ?? '';

function appUrl() {
  if (process.env.APP_DATABASE_URL) return process.env.APP_DATABASE_URL;
  const url = new URL(adminUrl);
  url.username = 'facture_app';
  url.password = 'facture_app';
  return url.toString();
}

function authUrl() {
  if (process.env.AUTH_DATABASE_URL) return process.env.AUTH_DATABASE_URL;
  const url = new URL(adminUrl);
  url.username = 'facture_auth';
  url.password = 'facture_auth';
  return url.toString();
}

export const env = {
  adminUrl,
  appUrl: appUrl(),
  authUrl: authUrl(),
  webUrl: process.env.WEB_URL ?? 'http://localhost:3100',
  tenantId: process.env.DEV_TENANT_ID ?? '',
  port: Number(process.env.API_PORT ?? 4100),
};
