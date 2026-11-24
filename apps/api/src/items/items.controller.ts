import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Inject } from '@nestjs/common';
import { ItemInput } from '@facture/core';
import { Audited } from '../audit/audited.js';
import { Roles } from '../common/roles.js';
import { ItemsService } from './items.service.js';

@Controller('items')
export class ItemsController {
  constructor(@Inject(ItemsService) private readonly service: ItemsService) {}

  @Get()
  list(@Query('q') q?: string) {
    return this.service.list(q, 1000);
  }

  @Post()
  @Audited({ action: 'item.created', entity: 'item', summary: (_q, r) => r?.name })
  create(@Body({ schema: ItemInput }) body: ItemInput) {
    return this.service.create(body);
  }

  @Patch(':id')
  @Audited({ action: 'item.updated', entity: 'item', summary: (_q, r) => r?.name })
  patch(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.service.patch(id, body);
  }

  @Delete(':id')
  @Roles('OWNER', 'ADMIN')
  @Audited({ action: 'item.deleted', entity: 'item', idFrom: 'param' })
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
