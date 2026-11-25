import { Body, Controller, Delete, Get, Header, HttpCode, Param, Patch, Post, Put, Query, Inject, Req, Res, StreamableFile, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { InvoiceInput, PaymentInput } from '@facture/core';
import { Audited } from '../audit/audited.js';
import { InternalTokenGuard } from '../common/internal-token.guard.js';
import { AllowViewer, Roles } from '../common/roles.js';
import { ApiException } from '../common/errors.js';
import { PdfService } from './pdf.service.js';
import { InvoicesService } from './invoices.service.js';

@Controller('invoices')
export class InvoicesController {
  constructor(
    @Inject(InvoicesService) private readonly service: InvoicesService,
    @Inject(PdfService) private readonly pdfs: PdfService,
  ) {}

  @Get()
  list(
    @Query('state') state?: string,
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Query('customerId') customerId?: string,
  ) {
    return this.service.summaries({ state, status, q, customerId }, 1000);
  }

  @Post()
  @Audited({ action: 'invoice.created', entity: 'invoice', summary: (_q, r) => `${r?.type} brouillon, ${r?.totals?.amountDue} ${r?.currency}` })
  create(@Body({ schema: InvoiceInput }) body: InvoiceInput) {
    return this.service.create(body);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Patch(':id')
  @Audited({ action: 'invoice.updated', entity: 'invoice' })
  update(@Param('id') id: string, @Body({ schema: InvoiceInput }) body: InvoiceInput) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles('OWNER', 'ADMIN')
  @Audited({ action: 'invoice.deleted', entity: 'invoice', idFrom: 'param' })
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Post(':id/issue')
  @HttpCode(200)
  @Audited({ action: 'invoice.issued', entity: 'invoice', summary: (_q, r) => r?.number })
  issue(@Param('id') id: string) {
    return this.service.issue(id);
  }

  @Post(':id/credit-note')
  @Audited({ action: 'credit_note.created', entity: 'invoice', summary: (q) => `Avoir sur ${q.params.id}` })
  creditNote(@Param('id') id: string) {
    return this.service.creditNote(id);
  }

  @Get(':id/ubl')
  @Header('Content-Type', 'application/xml; charset=utf-8')
  ubl(@Param('id') id: string) {
    return this.service.ubl(id);
  }

  @Put(':id/pdf')
  @UseGuards(InternalTokenGuard)
  @AllowViewer()
  @HttpCode(204)
  async storePdf(@Param('id') id: string, @Req() req: any) {
    if (!Buffer.isBuffer(req.body) || !String(req.headers['content-type']).startsWith('application/pdf')) {
      throw new ApiException(415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type application/pdf requis.');
    }
    await this.pdfs.store(id, req.body);
  }

  @Get(':id/pdf')
  async readPdf(@Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    const pdf = await this.pdfs.read(id);
    res.set({
      'Content-Type': 'application/pdf',
      ETag: `"${pdf.sha256}"`,
      'Cache-Control': 'private, no-store',
      'Content-Disposition': `attachment; filename="${pdf.number}.pdf"`,
    });
    return new StreamableFile(pdf.content);
  }

  @Post(':id/payments')
  @Audited({ action: 'payment.recorded', entity: 'invoice', idFrom: 'param', summary: (q) => `${q.body?.amount} ${q.body?.method}` })
  addPayment(@Param('id') id: string, @Body({ schema: PaymentInput }) body: PaymentInput) {
    return this.service.addPayment(id, body);
  }
}

@Controller('payments')
export class PaymentsController {
  constructor(@Inject(InvoicesService) private readonly service: InvoicesService) {}

  @Delete(':id')
  @HttpCode(200)
  @Roles('OWNER', 'ADMIN')
  @Audited({ action: 'payment.voided', entity: 'payment', idFrom: 'param', summary: (_q, r) => r?.number })
  remove(@Param('id') id: string) {
    return this.service.removePayment(id);
  }
}
