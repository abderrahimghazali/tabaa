import { Body, Controller, Delete, Get, Header, HttpCode, Param, Patch, Post, Put, Query, Inject } from '@nestjs/common';
import { InvoiceInput, PaymentInput } from '@facture/core';
import { InvoicesService } from './invoices.service.js';

@Controller('invoices')
export class InvoicesController {
  constructor(@Inject(InvoicesService) private readonly service: InvoicesService) {}

  @Get()
  list(
    @Query('state') state?: string,
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Query('customerId') customerId?: string,
  ) {
    return this.service.summaries({ state, status, q, customerId });
  }

  @Post()
  create(@Body({ schema: InvoiceInput }) body: InvoiceInput) {
    return this.service.create(body);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body({ schema: InvoiceInput }) body: InvoiceInput) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Post(':id/issue')
  @HttpCode(200)
  issue(@Param('id') id: string) {
    return this.service.issue(id);
  }

  @Post(':id/credit-note')
  creditNote(@Param('id') id: string) {
    return this.service.creditNote(id);
  }

  @Get(':id/ubl')
  @Header('Content-Type', 'application/xml; charset=utf-8')
  ubl(@Param('id') id: string) {
    return this.service.ubl(id);
  }

  @Post(':id/payments')
  addPayment(@Param('id') id: string, @Body({ schema: PaymentInput }) body: PaymentInput) {
    return this.service.addPayment(id, body);
  }
}

@Controller('payments')
export class PaymentsController {
  constructor(@Inject(InvoicesService) private readonly service: InvoicesService) {}

  @Delete(':id')
  @HttpCode(200)
  remove(@Param('id') id: string) {
    return this.service.removePayment(id);
  }
}
