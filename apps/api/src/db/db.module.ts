import { Global, Module } from '@nestjs/common';
import { TenantDb } from './tenant-db.js';

@Global()
@Module({ providers: [TenantDb], exports: [TenantDb] })
export class DbModule {}
