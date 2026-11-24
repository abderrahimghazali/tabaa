import { Module } from '@nestjs/common';
import { InvoicesController, PaymentsController } from './invoices.controller.js';
import { InvoicesService } from './invoices.service.js';

@Module({
  controllers: [InvoicesController, PaymentsController],
  providers: [InvoicesService],
  exports: [InvoicesService],
})
export class InvoicesModule {}
