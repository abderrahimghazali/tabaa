import { Inject, Injectable } from '@nestjs/common';
import type { Company, CompanyInput } from '@facture/core';
import { companies } from '../db/schema.js';
import { TenantDb } from '../db/tenant-db.js';
import { dto } from '../common/util.js';

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
  constructor(@Inject(TenantDb) private readonly t: TenantDb) {}

  async get(): Promise<Company | null> {
    const [row] = await this.t.tx.select().from(companies);
    return row ? (dto(row) as Company) : null;
  }

  async put(input: CompanyInput): Promise<Company> {
    const values = { ...EMPTY, ...input, tenantId: this.t.tenantId };
    const [row] = await this.t.tx
      .insert(companies)
      .values(values)
      .onConflictDoUpdate({ target: companies.tenantId, set: values })
      .returning();
    return dto(row) as Company;
  }
}
