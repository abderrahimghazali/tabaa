import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import { env } from '../env.js';

export function assertLocalDevDatabase(allowed: string[] = ['development']) {
  const host = new URL(env.adminUrl).hostname;
  if (!allowed.includes(env.nodeEnv) || !['localhost', '127.0.0.1'].includes(host)) {
    throw new Error(`Refusing to run: needs NODE_ENV in [${allowed.join(', ')}] and a local database (got ${env.nodeEnv}, ${host})`);
  }
}

// Owner connection with triggers off: the immutability trigger would otherwise block deleting issued invoices.
// The test suite is the only other caller allowed: its database name must end in _test (checked by the suite).
export async function wipeTenant(tenantId: string) {
  assertLocalDevDatabase(['development', 'test']);
  const db = drizzle(env.adminUrl);
  await db.transaction(async (tx) => {
    await tx.execute(sql`set local session_replication_role = replica`);
    await tx.execute(sql`delete from audit_events where tenant_id = ${tenantId}`);
    const members = sql`select user_id from memberships where tenant_id = ${tenantId}`;
    await tx.execute(sql`delete from sessions where tenant_id = ${tenantId} or user_id in (${members})`);
    await tx.execute(sql`delete from email_tokens where user_id in (${members})`);
    for (const t of ['mfa_authenticators', 'mfa_recovery_codes', 'mfa_failures', 'mfa_challenges']) {
      await tx.execute(sql`delete from ${sql.identifier(t)} where user_id in (${members})`);
    }
    for (const t of ['payments', 'invoices', 'numbering_sequences', 'items', 'parties', 'companies']) {
      await tx.execute(sql`delete from ${sql.identifier(t)} where tenant_id = ${tenantId}`);
    }
    await tx.execute(sql`delete from users where id in (${members})`);
    await tx.execute(sql`delete from memberships where tenant_id = ${tenantId}`);
    await tx.execute(sql`delete from tenants where id = ${tenantId}`);
  });
  await db.$client.end();
}
