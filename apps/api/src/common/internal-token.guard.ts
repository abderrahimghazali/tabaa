import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { hasInternalToken } from './client-ip.js';
import { ApiException } from './errors.js';

@Injectable()
export class InternalTokenGuard implements CanActivate {
  canActivate(ctx: ExecutionContext) {
    if (!hasInternalToken(ctx.switchToHttp().getRequest())) {
      throw new ApiException(403, 'FORBIDDEN', 'Réservé au serveur web.');
    }
    return true;
  }
}
