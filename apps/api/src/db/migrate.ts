import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { env } from '../env.js';

const db = drizzle(env.adminUrl);
await migrate(db, { migrationsFolder: './drizzle' });
await db.$client.end();
console.log('migrated');
