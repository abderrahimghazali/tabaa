import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Inject } from '@nestjs/common';
import { PartyInput } from '@facture/core';
import { Audited } from '../audit/audited.js';
import { Roles } from '../common/roles.js';
import { PartiesService } from './parties.service.js';

@Controller('parties')
export class PartiesController {
  constructor(@Inject(PartiesService) private readonly service: PartiesService) {}

  @Get()
  list(@Query('kind') kind?: string, @Query('q') q?: string) {
    return this.service.list(kind, q, 1000);
  }

  @Post()
  @Audited({ action: 'party.created', entity: 'party', summary: (_q, r) => r?.name })
  create(@Body({ schema: PartyInput }) body: PartyInput) {
    return this.service.create(body);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Patch(':id')
  @Audited({ action: 'party.updated', entity: 'party', summary: (_q, r) => r?.name })
  patch(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.service.patch(id, body);
  }

  @Delete(':id')
  @Roles('OWNER', 'ADMIN')
  @Audited({ action: 'party.deleted', entity: 'party', idFrom: 'param' })
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
