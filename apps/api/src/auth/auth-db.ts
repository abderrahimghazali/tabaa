import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { env } from '../env.js';

// Own connection and role: sessions and users are not tenant-scoped, and the business role cannot read them.
@Injectable()
export class AuthDb implements OnModuleDestroy {
  readonly db = drizzle({ client: new Pool({ connectionString: env.authUrl }) });

  onModuleDestroy() {
    return this.db.$client.end();
  }
}
