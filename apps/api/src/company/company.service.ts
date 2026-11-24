import { Inject, Injectable } from '@nestjs/common';
import type { Company, CompanyInput } from '@facture/core';
import { companies } from '../db/schema.js';
import { TenantDb } from '../db/tenant-db.js';
import { dto } from '../common/util.js';
import { AuditService } from '../audit/audit.service.js';

const EMPTY = {
  legalForm: null,
  capital: null,
  ifNumber: null,
  rcNumber: null,
  rcCourt: null,
  tpNumber: null,
  cnssNumber: null,
  phone: null,
  email: null,
  bankName: null,
  rib: null,
};

@Injectable()
export class CompanyService {
  constructor(
    @Inject(TenantDb) private readonly t: TenantDb,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async get(): Promise<Company | null> {
    const [row] = await this.t.tx.select().from(companies);
    return row ? (dto(row) as Company) : null;
  }

  async put(input: CompanyInput): Promise<Company> {
    const before = await this.get();
    const values = { ...EMPTY, ...input, tenantId: this.t.tenantId };
    const [row] = await this.t.tx
      .insert(companies)
      .values(values)
      .onConflictDoUpdate({ target: companies.tenantId, set: values })
      .returning();
    const after = dto(row) as Company;
    const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after)]);
    keys.delete('id');
    const changed = before
      ? [...keys].filter((k) => JSON.stringify((before as any)[k]) !== JSON.stringify((after as any)[k]))
      : [];
    await this.audit.record({
      action: before ? 'company.updated' : 'company.created',
      entityType: 'company',
      entityId: after.id,
      summary: before ? (changed.length ? `Champs modifiés : ${changed.join(', ')}` : 'Aucun changement') : undefined,
    });
    return after;
  }
}
