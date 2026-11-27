import { Module } from '@nestjs/common';
import { PurchasesModule } from '../purchases/purchases.module.js';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';

@Module({ imports: [PurchasesModule], controllers: [ReportsController], providers: [ReportsService] })
export class ReportsModule {}
