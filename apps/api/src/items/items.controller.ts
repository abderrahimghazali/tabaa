import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Inject } from '@nestjs/common';
import { ItemInput } from '@facture/core';
import { ItemsService } from './items.service.js';

@Controller('items')
export class ItemsController {
  constructor(@Inject(ItemsService) private readonly service: ItemsService) {}

  @Get()
  list(@Query('q') q?: string) {
    return this.service.list(q);
  }

  @Post()
  create(@Body({ schema: ItemInput }) body: ItemInput) {
    return this.service.create(body);
  }

  @Patch(':id')
  patch(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.service.patch(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
