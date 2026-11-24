import { Module } from '@nestjs/common';
import { AuthenticationModule } from '@nestjs/authentication';
import { createObserveModule } from '@nestjs/observe';
import { ThrottlerModule, minutes, normalizeIp } from '@nestjs/throttler';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ApiExceptionFilter } from './common/api-exception.filter.js';
import { AppThrottlerGuard } from './common/throttler.guard.js';
import { TenantInterceptor } from './common/tenant.interceptor.js';
import { accountEmail } from './auth/account-email.js';
import { AuthModule } from './auth/auth.module.js';
import { env } from './env.js';
import { CompanyModule } from './company/company.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { DbModule } from './db/db.module.js';
import { InvoicesModule } from './invoices/invoices.module.js';
import { ItemsModule } from './items/items.module.js';
import { PartiesModule } from './parties/parties.module.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    // Distributed tracing, auto-correlated logs, request/job metrics, error
    // telemetry, alarms, and more — out of the box. Sign up at https://observe.nestjs.com,
    // then run `npx @nestjs/observe link` to write your key pair into .env.
    ObserveModule.forRoot({
      appKey: process.env.OBSERVE_APP_KEY ?? 'YOUR_APP_KEY',
      appSecret: process.env.OBSERVE_APP_SECRET ?? 'YOUR_APP_SECRET',
      serviceId: 'api',
    }),
    ThrottlerModule.forRoot([
      { name: 'default', ttl: minutes(1), limit: 600 },
      {
        name: 'account',
        ttl: minutes(15),
        limit: 10,
        skipIf: (context) => !accountEmail(context.switchToHttp().getRequest()),
        getTracker: (req) => `${accountEmail(req)}|${normalizeIp(req.ip)}`,
      },
    ]),
    AuthenticationModule.forRoot({
      session: {
        cookieName: 'tabaa_session',
        absoluteTtl: '30d',
        idleTtl: '30d',
        cookie: { secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' },
        trustedOrigins: [env.webUrl],
      },
      password: { logN: process.env.NODE_ENV === 'test' ? 10 : 17 },
      passwordReset: { url: `${env.webUrl}/reinitialiser`, ttl: '1h' },
    }),
    DbModule,
    AuthModule,
    CompanyModule,
    PartiesModule,
    ItemsModule,
    InvoicesModule,
    DashboardModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: TenantInterceptor },
  ],
})
export class AppModule {}
