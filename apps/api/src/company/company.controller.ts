import { Body, Controller, Get, Put, Inject, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CompanyInput } from '@facture/core';
import { Roles } from '../common/roles.js';
import { CompanyService } from './company.service.js';

@Controller('company')
export class CompanyController {
  constructor(@Inject(CompanyService) private readonly service: CompanyService) {}

  @Get()
  async get(@Res() res: Response) {
    res.json(await this.service.get());
  }

  @Put()
  @Roles('OWNER', 'ADMIN')
  put(@Body({ schema: CompanyInput }) body: CompanyInput) {
    return this.service.put(body);
  }
}
