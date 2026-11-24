import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import { env } from '../env.js';

// Owner connection with triggers off: the immutability trigger would otherwise block deleting issued invoices.
export async function wipeTenant(tenantId: string) {
  const db = drizzle(env.adminUrl);
  await db.transaction(async (tx) => {
    await tx.execute(sql`set local session_replication_role = replica`);
    const members = sql`select user_id from memberships where tenant_id = ${tenantId}`;
    await tx.execute(sql`delete from sessions where tenant_id = ${tenantId} or user_id in (${members})`);
    await tx.execute(sql`delete from email_tokens where user_id in (${members})`);
    for (const t of ['payments', 'invoices', 'numbering_sequences', 'items', 'parties', 'companies']) {
      await tx.execute(sql`delete from ${sql.identifier(t)} where tenant_id = ${tenantId}`);
    }
    await tx.execute(sql`delete from users where id in (${members})`);
    await tx.execute(sql`delete from memberships where tenant_id = ${tenantId}`);
    await tx.execute(sql`delete from tenants where id = ${tenantId}`);
  });
  await db.$client.end();
}
