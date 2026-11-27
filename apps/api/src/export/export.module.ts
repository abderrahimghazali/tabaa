import { Module } from '@nestjs/common';
import { CompanyModule } from '../company/company.module.js';
import { InvoicesModule } from '../invoices/invoices.module.js';
import { ItemsModule } from '../items/items.module.js';
import { PurchasesModule } from '../purchases/purchases.module.js';
import { PartiesModule } from '../parties/parties.module.js';
import { ExportController } from './export.controller.js';

@Module({ imports: [CompanyModule, PartiesModule, ItemsModule, InvoicesModule, PurchasesModule], controllers: [ExportController] })
export class ExportModule {}
