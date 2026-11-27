import { Module } from '@nestjs/common';
import { InvoicesModule } from '../invoices/invoices.module.js';
import { BankController } from './bank.controller.js';
import { BankService } from './bank.service.js';

@Module({ imports: [InvoicesModule], controllers: [BankController], providers: [BankService] })
export class BankModule {}
