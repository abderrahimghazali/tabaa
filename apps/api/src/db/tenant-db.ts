import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { env } from '../env.js';

const open = () => drizzle({ client: new Pool({ connectionString: env.appUrl }) });
export type Tx = Parameters<Parameters<ReturnType<typeof open>['transaction']>[0]>[0];

export interface RequestCtx {
  userId?: string;
  userName?: string;
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class TenantDb implements OnModuleDestroy {
  private readonly db = open();
  private readonly als = new AsyncLocalStorage<{ tx: Tx; tenantId: string; ctx: RequestCtx }>();

  run<T>(tenantId: string, fn: () => Promise<T>, ctx: RequestCtx = {}): Promise<T> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
      return this.als.run({ tx, tenantId, ctx }, fn);
    });
  }

  get tx(): Tx {
    const store = this.als.getStore();
    if (!store) throw new Error('No tenant transaction in this context');
    return store.tx;
  }

  get ctx(): RequestCtx {
    return this.als.getStore()?.ctx ?? {};
  }

  get tenantId(): string {
    return this.als.getStore()!.tenantId;
  }

  onModuleDestroy() {
    return this.db.$client.end();
  }
}
