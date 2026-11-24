import { Inject, Injectable } from '@nestjs/common';
import { ItemInput, type Item } from '@facture/core';
import { asc, eq, ilike } from 'drizzle-orm';
import { items } from '../db/schema.js';
import { TenantDb } from '../db/tenant-db.js';
import { notFound } from '../common/errors.js';
import { dto } from '../common/util.js';

@Injectable()
export class ItemsService {
  constructor(@Inject(TenantDb) private readonly t: TenantDb) {}

  async list(q?: string): Promise<Item[]> {
    const rows = await this.t.tx
      .select()
      .from(items)
      .where(q ? ilike(items.name, `%${q}%`) : undefined)
      .orderBy(asc(items.name));
    return rows.map((r) => dto(r) as Item);
  }

  async create(input: ItemInput): Promise<Item> {
    const [row] = await this.t.tx
      .insert(items)
      .values({ description: null, ...input, tenantId: this.t.tenantId })
      .returning();
    return dto(row) as Item;
  }

  async patch(id: string, patch: Record<string, unknown>): Promise<Item> {
    const [current] = await this.t.tx.select().from(items).where(eq(items.id, id));
    if (!current) throw notFound('Article');
    const { id: _id, ...rest } = dto(current);
    const input = ItemInput.parse({ ...rest, ...patch });
    const [row] = await this.t.tx
      .update(items)
      .set({ description: null, ...input })
      .where(eq(items.id, id))
      .returning();
    return dto(row) as Item;
  }

  async remove(id: string) {
    const rows = await this.t.tx.delete(items).where(eq(items.id, id)).returning({ id: items.id });
    if (!rows.length) throw notFound('Article');
  }
}
