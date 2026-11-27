import { Inject, Injectable } from '@nestjs/common';
import { PartyInput, type Party } from '@facture/core';
import { and, asc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { invoices, parties, purchases } from '../db/schema.js';
import { TenantDb } from '../db/tenant-db.js';
import { conflict, notFound } from '../common/errors.js';
import { dto } from '../common/util.js';

const EMPTY = { ice: null, ifNumber: null, email: null, phone: null, paymentTermDays: null };

@Injectable()
export class PartiesService {
  constructor(@Inject(TenantDb) private readonly t: TenantDb) {}

  async list(kind?: string, q?: string, limit = 1_000_000): Promise<Party[]> {
    const where = and(
      kind === 'CUSTOMER' || kind === 'SUPPLIER' ? inArray(parties.kind, [kind, 'BOTH']) : undefined,
      kind === 'BOTH' ? eq(parties.kind, 'BOTH') : undefined,
      q ? or(ilike(parties.name, `%${q}%`), ilike(parties.ice, `%${q}%`)) : undefined,
    );
    const rows = await this.t.tx.select().from(parties).where(where).orderBy(asc(parties.name)).limit(limit);
    return rows.map((r) => dto(r) as Party);
  }

  async find(id: string) {
    const [row] = await this.t.tx.select().from(parties).where(eq(parties.id, id));
    if (!row) throw notFound('Tiers');
    return row;
  }

  async get(id: string) {
    return dto(await this.find(id)) as Party;
  }

  async create(input: PartyInput): Promise<Party> {
    const [row] = await this.t.tx
      .insert(parties)
      .values({ ...EMPTY, ...input, tenantId: this.t.tenantId })
      .returning();
    return dto(row) as Party;
  }

  async patch(id: string, patch: Record<string, unknown>): Promise<Party> {
    const { id: _id, ...current } = await this.get(id);
    const input = PartyInput.parse({ ...current, ...patch });
    const [row] = await this.t.tx
      .update(parties)
      .set({ ...EMPTY, ...input })
      .where(eq(parties.id, id))
      .returning();
    return dto(row) as Party;
  }

  async remove(id: string) {
    await this.find(id);
    const [{ n }] = await this.t.tx
      .select({ n: sql<number>`count(*)::int` })
      .from(invoices)
      .where(eq(invoices.customerId, id));
    const [{ m }] = await this.t.tx
      .select({ m: sql<number>`count(*)::int` })
      .from(purchases)
      .where(eq(purchases.supplierId, id));
    if (n > 0 || m > 0) throw conflict('Ce tiers est utilisé par des factures et ne peut pas être supprimé.');
    await this.t.tx.delete(parties).where(eq(parties.id, id));
  }
}
