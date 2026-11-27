import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Put, Query } from '@nestjs/common';
import { DisputePurchaseInput, PurchaseInput, PurchasePaymentInput, PurchaseState, RejectPurchaseInput } from '@facture/core';
import { invalid } from '../common/errors.js';
import { Roles } from '../common/roles.js';
import { PurchasesService } from './purchases.service.js';

const bad = (path: string, message: string) => invalid(`Paramètre ${path} invalide.`, [{ path, rule: 'schema', message }]);
const date = (path: string, v?: string) => {
  if (v !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw bad(path, 'Date ISO attendue (AAAA-MM-JJ).');
  return v;
};

@Controller('purchases')
export class PurchasesController {
  constructor(@Inject(PurchasesService) private readonly service: PurchasesService) {}

  @Get()
  list(
    @Query('state') state?: string,
    @Query('paymentStatus') paymentStatus?: string,
    @Query('overdue') overdue?: string,
    @Query('supplierId') supplierId?: string,
    @Query('q') q?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '50',
  ) {
    const s = state ? PurchaseState.safeParse(state) : undefined;
    if (s && !s.success) throw bad('state', 'TO_APPROVE, APPROVED ou REJECTED.');
    if (paymentStatus && !['UNPAID', 'PARTIAL', 'PAID'].includes(paymentStatus)) throw bad('paymentStatus', 'UNPAID, PARTIAL ou PAID.');
    if (overdue && !['true', 'false'].includes(overdue)) throw bad('overdue', 'true ou false.');
    const p = Number(page);
    const n = Number(pageSize);
    if (!Number.isInteger(p) || p < 1) throw bad('page', 'Entier supérieur ou égal à 1.');
    if (!Number.isInteger(n) || n < 1 || n > 100) throw bad('pageSize', 'Entier entre 1 et 100.');
    return this.service.list({
      state: s?.data,
      paymentStatus: paymentStatus as 'UNPAID' | 'PARTIAL' | 'PAID' | undefined,
      overdue: overdue ? overdue === 'true' : undefined,
      supplierId,
      q,
      from: date('from', from),
      to: date('to', to),
      page: p,
      pageSize: n,
    });
  }

  @Post()
  @Roles('OWNER', 'ADMIN', 'MEMBER')
  create(@Body({ schema: PurchaseInput }) body: PurchaseInput) {
    return this.service.create(body);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Put(':id')
  @Roles('OWNER', 'ADMIN', 'MEMBER')
  update(@Param('id') id: string, @Body({ schema: PurchaseInput }) body: PurchaseInput) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles('OWNER', 'ADMIN')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @Roles('OWNER', 'ADMIN')
  approve(@Param('id') id: string) {
    return this.service.approve(id);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @Roles('OWNER', 'ADMIN')
  reject(@Param('id') id: string, @Body({ schema: RejectPurchaseInput }) body: RejectPurchaseInput) {
    return this.service.reject(id, body);
  }

  @Post(':id/reopen')
  @HttpCode(200)
  @Roles('OWNER', 'ADMIN')
  reopen(@Param('id') id: string) {
    return this.service.reopen(id);
  }

  @Post(':id/dispute')
  @HttpCode(200)
  @Roles('OWNER', 'ADMIN', 'MEMBER')
  dispute(@Param('id') id: string, @Body({ schema: DisputePurchaseInput }) body: DisputePurchaseInput) {
    return this.service.dispute(id, body);
  }

  @Post(':id/payments')
  @Roles('OWNER', 'ADMIN', 'MEMBER')
  addPayment(@Param('id') id: string, @Body({ schema: PurchasePaymentInput }) body: PurchasePaymentInput) {
    return this.service.addPayment(id, body);
  }

  @Delete(':id/payments/:paymentId')
  @HttpCode(200)
  @Roles('OWNER', 'ADMIN')
  voidPayment(@Param('id') id: string, @Param('paymentId') paymentId: string) {
    return this.service.voidPayment(id, paymentId);
  }
}
