import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Query } from '@nestjs/common';
import { BankImportInput, BankMatchInput, BankTransactionStatus } from '@facture/core';
import { invalid } from '../common/errors.js';
import { Roles } from '../common/roles.js';
import { BankService } from './bank.service.js';

const bad = (path: string, message: string) => invalid(`Paramètre ${path} invalide.`, [{ path, rule: 'schema', message }]);

@Controller('bank')
export class BankController {
  constructor(@Inject(BankService) private readonly service: BankService) {}

  @Post('imports')
  @Roles('OWNER', 'ADMIN', 'MEMBER')
  importLines(@Body({ schema: BankImportInput }) body: BankImportInput) {
    return this.service.importLines(body);
  }

  @Get('imports')
  imports() {
    return this.service.imports();
  }

  @Delete('imports/:id')
  @HttpCode(204)
  @Roles('OWNER', 'ADMIN')
  removeImport(@Param('id') id: string) {
    return this.service.removeImport(id);
  }

  @Get('transactions')
  list(
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Query('importId') importId?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '50',
  ) {
    const s = status ? BankTransactionStatus.safeParse(status) : undefined;
    if (s && !s.success) throw bad('status', 'UNMATCHED, MATCHED ou IGNORED.');
    const p = Number(page);
    const n = Number(pageSize);
    if (!Number.isInteger(p) || p < 1) throw bad('page', 'Entier supérieur ou égal à 1.');
    if (!Number.isInteger(n) || n < 1 || n > 100) throw bad('pageSize', 'Entier entre 1 et 100.');
    return this.service.list({ status: s?.data, q, importId, page: p, pageSize: n });
  }

  @Post('transactions/:id/match')
  @HttpCode(200)
  @Roles('OWNER', 'ADMIN', 'MEMBER')
  match(@Param('id') id: string, @Body({ schema: BankMatchInput }) body: BankMatchInput) {
    return this.service.match(id, body);
  }

  @Post('transactions/:id/unmatch')
  @HttpCode(200)
  @Roles('OWNER', 'ADMIN')
  unmatch(@Param('id') id: string) {
    return this.service.unmatch(id);
  }

  @Post('transactions/:id/ignore')
  @HttpCode(200)
  @Roles('OWNER', 'ADMIN', 'MEMBER')
  ignore(@Param('id') id: string) {
    return this.service.setIgnored(id, true);
  }

  @Post('transactions/:id/unignore')
  @HttpCode(200)
  @Roles('OWNER', 'ADMIN', 'MEMBER')
  unignore(@Param('id') id: string) {
    return this.service.setIgnored(id, false);
  }
}
