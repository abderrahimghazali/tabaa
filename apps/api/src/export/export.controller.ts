import { Controller, Get, Inject } from '@nestjs/common';
import { Audited } from '../audit/audited.js';
import { Roles } from '../common/roles.js';
import { dto } from '../common/util.js';
import { CompanyService } from '../company/company.service.js';
import { payments } from '../db/schema.js';
import { TenantDb } from '../db/tenant-db.js';
import { InvoicesService } from '../invoices/invoices.service.js';
import { ItemsService } from '../items/items.service.js';
import { PartiesService } from '../parties/parties.service.js';

@Controller('export')
export class ExportController {
  constructor(
    @Inject(TenantDb) private readonly t: TenantDb,
    @Inject(CompanyService) private readonly company: CompanyService,
    @Inject(PartiesService) private readonly parties: PartiesService,
    @Inject(ItemsService) private readonly items: ItemsService,
    @Inject(InvoicesService) private readonly invoices: InvoicesService,
  ) {}

  @Get()
  @Roles('OWNER')
  @Audited({ action: 'tenant.exported', entity: 'tenant', idFrom: 'result', summary: () => 'Export complet des données' })
  async export() {
    const summaries = await this.invoices.summaries();
    const invoices = [];
    for (const s of summaries) invoices.push(await this.invoices.get(s.id));
    const allPayments = await this.t.tx.select().from(payments);
    return {
      id: this.t.tenantId,
      exportedAt: new Date().toISOString(),
      tenantId: this.t.tenantId,
      company: await this.company.get(),
      parties: await this.parties.list(),
      items: await this.items.list(),
      invoices,
      payments: allPayments.map((p) => dto(p)),
    };
  }
}
