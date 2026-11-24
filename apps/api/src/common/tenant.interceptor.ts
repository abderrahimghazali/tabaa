import { CallHandler, ExecutionContext, Inject, Injectable, NestInterceptor } from '@nestjs/common';
import { from, lastValueFrom } from 'rxjs';
import type { AuthUser } from '../auth/auth-types.js';
import { TenantDb } from '../db/tenant-db.js';
import { ApiException } from './errors.js';

const READ_ONLY = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class TenantInterceptor implements NestInterceptor {
  constructor(@Inject(TenantDb) private readonly tenantDb: TenantDb) {}

  intercept(ctx: ExecutionContext, next: CallHandler) {
    const req = ctx.switchToHttp().getRequest();
    const user: AuthUser | undefined = req.user;
    if (!user) return next.handle();
    if (user.role === 'VIEWER' && !READ_ONLY.has(req.method)) {
      throw new ApiException(403, 'FORBIDDEN', 'Votre rôle ne permet que la consultation.');
    }
    return from(this.tenantDb.run(user.tenantId, () => lastValueFrom(next.handle(), { defaultValue: undefined })));
  }
}
