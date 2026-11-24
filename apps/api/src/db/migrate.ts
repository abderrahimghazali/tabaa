import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { sql } from 'drizzle-orm';
import { env } from '../env.js';

const db = drizzle(env.adminUrl);
await migrate(db, { migrationsFolder: './drizzle' });

// Roles are created without a password; the secrets live only in the environment.
for (const [role, connection] of [
  ['facture_app', env.appUrl],
  ['facture_auth', env.authUrl],
] as const) {
  const u = new URL(connection);
  if (decodeURIComponent(u.username) !== role) throw new Error(`Connection URL for ${role} must use that user`);
  const password = decodeURIComponent(u.password);
  if (!password) throw new Error(`Connection URL for ${role} has no password`);
  const { rows } = await db.execute<{ stmt: string }>(
    sql`select format('alter role %I login password %L', ${role}::text, ${password}::text) as stmt`,
  );
  await db.execute(sql.raw(rows[0].stmt));
}

await db.$client.end();
console.log('migrated');
