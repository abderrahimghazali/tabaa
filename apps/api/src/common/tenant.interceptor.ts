import { CallHandler, ExecutionContext, Inject, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { from, lastValueFrom } from 'rxjs';
import { AUDIT, type AuditMeta } from '../audit/audited.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth-types.js';
import { TenantDb } from '../db/tenant-db.js';
import { requestInfo } from './client-ip.js';
import { ALLOW_VIEWER } from './roles.js';
import { denyRole } from './roles.js';

const READ_ONLY = new Set(['GET', 'HEAD', 'OPTIONS']);
const READ_ONLY_ROLES = new Set(['VIEWER', 'ACCOUNTANT']);

@Injectable()
export class TenantInterceptor implements NestInterceptor {
  constructor(
    @Inject(TenantDb) private readonly tenantDb: TenantDb,
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async intercept(ctx: ExecutionContext, next: CallHandler) {
    const req = ctx.switchToHttp().getRequest();
    const user: AuthUser | undefined = req.user;
    if (!user) return next.handle();
    const viewerOk = this.reflector.get<boolean | undefined>(ALLOW_VIEWER, ctx.getHandler());
    if (READ_ONLY_ROLES.has(user.role) && !viewerOk && !READ_ONLY.has(req.method)) {
      await denyRole(this.audit, req, user, 'lecture seule');
    }
    const meta = this.reflector.get<AuditMeta | undefined>(AUDIT, ctx.getHandler());
    const info = requestInfo(req);
    return from(
      this.tenantDb.run(
        user.tenantId,
        async () => {
          const result = await lastValueFrom(next.handle(), { defaultValue: undefined });
          if (meta) {
            const id = meta.idFrom === 'param' ? req.params.id : (result?.id ?? req.params.id);
            await this.audit.record({
              action: meta.action,
              entityType: meta.entity,
              entityId: id,
              summary: meta.summary?.(req, result),
            });
          }
          return result;
        },
        { userId: user.id, userName: user.name, ...info },
      ),
    );
  }
}
