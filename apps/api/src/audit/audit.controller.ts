import { Controller, Get, Inject, Query } from '@nestjs/common';
import { invalid } from '../common/errors.js';
import { Roles } from '../common/roles.js';
import { AuditService } from './audit.service.js';

@Controller('audit-events')
export class AuditController {
  constructor(@Inject(AuditService) private readonly service: AuditService) {}

  @Get()
  @Roles('OWNER', 'ADMIN')
  list(@Query('limit') limit?: string, @Query('before') before?: string) {
    const n = limit === undefined ? 50 : Number(limit);
    if (!Number.isInteger(n) || n < 1 || n > 100) {
      throw invalid('Paramètre limit invalide.', [{ path: 'limit', rule: 'schema', message: 'Entier entre 1 et 100.' }]);
    }
    const cursor = before ? new Date(before) : undefined;
    if (cursor && Number.isNaN(cursor.getTime())) {
      throw invalid('Paramètre before invalide.', [{ path: 'before', rule: 'schema', message: 'Date ISO attendue.' }]);
    }
    return this.service.list(n, cursor);
  }
}
