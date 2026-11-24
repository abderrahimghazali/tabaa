import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const rootEnv = resolve(import.meta.dirname, '../../../.env');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const withDb = (url: string | undefined, name: string) => {
  const u = new URL(url ?? 'postgres://invalid');
  u.pathname = `/${name}`;
  return u.toString();
};

// A separate database on the same local server: tests never touch the dev data.
export function testEnv() {
  const devName = new URL(process.env.DATABASE_URL ?? 'postgres://invalid/facture').pathname.slice(1);
  const name = devName.endsWith('_test') ? devName : `${devName}_test`;
  return {
    name,
    vars: {
      NODE_ENV: 'test',
      DATABASE_URL: withDb(process.env.DATABASE_URL, name),
      APP_DATABASE_URL: withDb(process.env.APP_DATABASE_URL, name),
      AUTH_DATABASE_URL: withDb(process.env.AUTH_DATABASE_URL, name),
    },
  };
}
