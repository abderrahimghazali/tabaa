import { Module } from '@nestjs/common';
import { InvoicesController, PaymentsController } from './invoices.controller.js';
import { PdfService } from './pdf.service.js';
import { DeliveryService } from './delivery.service.js';
import { InvoicesService } from './invoices.service.js';

@Module({
  controllers: [InvoicesController, PaymentsController],
  providers: [InvoicesService, PdfService, DeliveryService],
  exports: [InvoicesService],
})
export class InvoicesModule {}
