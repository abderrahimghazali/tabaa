import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { testEnv } from './test-db.js';

export default async function setup() {
  const { name, vars } = testEnv();
  if (!name.endsWith('_test')) throw new Error('Refusing to set up a database whose name does not end with _test');
  const admin = new URL(vars.DATABASE_URL);
  admin.pathname = '/postgres';
  const client = new Client({ connectionString: admin.toString() });
  await client.connect();
  await client.query(`drop database if exists "${name}" with (force)`);
  await client.query(`create database "${name}"`);
  await client.end();
  execFileSync('pnpm', ['exec', 'tsx', 'src/db/migrate.ts'], {
    cwd: resolve(import.meta.dirname, '..'),
    env: { ...process.env, ...vars },
    stdio: 'pipe',
  });
}
