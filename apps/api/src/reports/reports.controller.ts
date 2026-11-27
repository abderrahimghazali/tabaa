import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ReportsService } from './reports.service.js';

@Controller('reports')
export class ReportsController {
  constructor(@Inject(ReportsService) private readonly service: ReportsService) {}

  @Get('vat')
  vat(@Query('period') period?: string, @Query('previousCredit') previousCredit?: string) {
    return this.service.vat(period, previousCredit);
  }

  @Get('withholdings')
  withholdings(@Query('period') period?: string) {
    return this.service.withholdings(period);
  }

  @Get('payment-terms')
  paymentTerms(@Query('period') period?: string, @Query('keyRate') keyRate?: string) {
    return this.service.paymentTerms(period, keyRate);
  }
}
