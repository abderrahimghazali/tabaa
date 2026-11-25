import { applyDecorators, CanActivate, ExecutionContext, Inject, Injectable, SetMetadata, UseGuards } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@facture/core';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth-types.js';
import { requestInfo } from './client-ip.js';
import { ApiException } from './errors.js';

const ROLES = 'roles';

export async function denyRole(audit: AuditService, req: any, user: AuthUser, why: string): Promise<never> {
  await audit.recordDetached({
    tenantId: user.tenantId,
    actorUserId: user.id,
    actorName: user.name,
    action: 'auth.forbidden',
    summary: `${req.method} ${String(req.route?.path ?? req.path).slice(0, 120)}: ${why}`,
    ...requestInfo(req),
  });
  throw new ApiException(403, 'FORBIDDEN', 'Votre rôle ne permet pas cette action.');
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async canActivate(ctx: ExecutionContext) {
    const roles = this.reflector.get<Role[] | undefined>(ROLES, ctx.getHandler());
    const req = ctx.switchToHttp().getRequest();
    const user: AuthUser | undefined = req.user;
    if (!roles || !user) return true;
    if (!roles.includes(user.role)) await denyRole(this.audit, req, user, `rôle ${user.role} refusé`);
    return true;
  }
}

export const Roles = (...roles: Role[]) => applyDecorators(SetMetadata(ROLES, roles), UseGuards(RolesGuard));

// For system-side stores of read artefacts (e.g. the invoice PDF): any role may trigger them.
export const ALLOW_VIEWER = 'allowViewer';
export const AllowViewer = () => SetMetadata(ALLOW_VIEWER, true);
