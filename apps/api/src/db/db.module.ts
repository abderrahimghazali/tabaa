import { Global, Module } from '@nestjs/common';
import { AuthDb } from '../auth/auth-db.js';
import { TenantDb } from './tenant-db.js';

@Global()
@Module({ providers: [TenantDb, AuthDb], exports: [TenantDb, AuthDb] })
export class DbModule {}
