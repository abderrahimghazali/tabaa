import { Module } from '@nestjs/common';
import { AuthenticationModule } from '@nestjs/authentication';
import { ThrottlerModule, minutes, normalizeIp } from '@nestjs/throttler';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ApiExceptionFilter } from './common/api-exception.filter.js';
import { AppThrottlerGuard } from './common/throttler.guard.js';
import { TenantInterceptor } from './common/tenant.interceptor.js';
import { accountEmail } from './auth/account-email.js';
import { cookieSecure, scryptLogN } from './auth/security-policy.js';
import { AuditModule } from './audit/audit.module.js';
import { ExportModule } from './export/export.module.js';
import { AuthModule } from './auth/auth.module.js';
import { env } from './env.js';
import { CompanyModule } from './company/company.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { DbModule } from './db/db.module.js';
import { InvoicesModule } from './invoices/invoices.module.js';
import { ItemsModule } from './items/items.module.js';
import { PartiesModule } from './parties/parties.module.js';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      { name: 'default', ttl: minutes(1), limit: 600 },
      {
        name: 'account',
        ttl: minutes(15),
        limit: 10,
        skipIf: (context) => !accountEmail(context.switchToHttp().getRequest()),
        getTracker: (req) => `${accountEmail(req)}|${normalizeIp(req.clientIp ?? req.ip)}`,
      },
    ]),
    AuthenticationModule.forRoot({
      session: {
        cookieName: 'tabaa_session',
        absoluteTtl: '14d',
        idleTtl: '8h',
        cookie: { secure: cookieSecure(env.nodeEnv), sameSite: 'lax', path: '/' },
        trustedOrigins: [env.webUrl],
      },
      password: { logN: scryptLogN(env.nodeEnv) },
      passwordReset: { url: `${env.webUrl}/reinitialiser`, ttl: '1h' },
    }),
    DbModule,
    AuthModule,
    CompanyModule,
    PartiesModule,
    ItemsModule,
    InvoicesModule,
    DashboardModule,
    AuditModule,
    ExportModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: TenantInterceptor },
  ],
})
export class AppModule {}
