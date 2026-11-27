import { Module } from '@nestjs/common';
import { AuthenticationModule } from '@nestjs/authentication';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, minutes, normalizeIp } from '@nestjs/throttler';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ApiExceptionFilter } from './common/api-exception.filter.js';
import { AppThrottlerGuard } from './common/throttler.guard.js';
import { TenantInterceptor } from './common/tenant.interceptor.js';
import { accountEmail } from './auth/account-email.js';
import { cookieSecure, globalLimit, scryptLogN } from './auth/security-policy.js';
import { AuditModule } from './audit/audit.module.js';
import { MailModule } from './mail/mail.module.js';
import { clock } from './common/clock.js';
import { RedisThrottlerStorage } from './common/redis-throttler.storage.js';
import { RetentionModule } from './retention/retention.module.js';
import { PurchasesModule } from './purchases/purchases.module.js';
import { ReportsModule } from './reports/reports.module.js';
import { BankModule } from './bank/bank.module.js';
import { TeamModule } from './team/team.module.js';
import { TenantModule } from './tenant/tenant.module.js';
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
    ScheduleModule.forRoot(),
    MailModule,
    ThrottlerModule.forRoot({
      ...(env.redisUrl && { storage: new RedisThrottlerStorage(env.redisUrl) }),
      throttlers: [
        { name: 'default', ttl: minutes(1), limit: globalLimit(env.nodeEnv) },
        {
          name: 'account',
          ttl: minutes(15),
          limit: 10,
          skipIf: (context) => !accountEmail(context.switchToHttp().getRequest()),
          getTracker: (req) => `${accountEmail(req)}|${normalizeIp(req.clientIp ?? req.ip)}`,
        },
      ],
    }),
    AuthenticationModule.forRoot({
      session: {
        cookieName: 'tabaa_session',
        absoluteTtl: '14d',
        idleTtl: '8h',
        cookie: { secure: cookieSecure(env.nodeEnv), sameSite: 'lax', path: '/' },
        trustedOrigins: [env.webUrl],
      },
      password: { logN: scryptLogN(env.nodeEnv) },
      mfa: { issuer: 'Tabaa', encryption: { keys: [env.mfaKey] }, pendingTtl: '5m', now: clock.now },
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
    TenantModule,
    TeamModule,
    BankModule,
    PurchasesModule,
    ReportsModule,
    RetentionModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: TenantInterceptor },
  ],
})
export class AppModule {}
