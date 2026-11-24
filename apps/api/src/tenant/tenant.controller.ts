import { Body, Controller, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import { CurrentUser, SessionService } from '@nestjs/authentication';
import { Throttle, minutes } from '@nestjs/throttler';
import { CloseTenantInput } from '@facture/core';
import type { Response } from 'express';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth-types.js';
import { AuthService } from '../auth/auth.service.js';
import { sensitiveLimit } from '../auth/security-policy.js';
import { env } from '../env.js';
import { requestInfo } from '../common/client-ip.js';
import { invalid } from '../common/errors.js';
import { Roles } from '../common/roles.js';
import { MailService } from '../mail/mail.service.js';

@Controller('tenant')
export class TenantController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(MailService) private readonly mail: MailService,
    @Inject(SessionService) private readonly sessions: SessionService,
  ) {}

  @Post('close')
  @Roles('OWNER')
  @HttpCode(204)
  @Throttle({ default: { limit: sensitiveLimit(env.nodeEnv, 5), ttl: minutes(15) } })
  async close(
    @Body({ schema: CloseTenantInput }) body: CloseTenantInput,
    @CurrentUser() user: AuthUser,
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const info = requestInfo(req);
    const actor = { tenantId: user.tenantId, actorUserId: user.id, actorName: user.name, ...info };
    try {
      await this.auth.reauth(user, body);
    } catch (err) {
      await this.audit.recordDetached({ action: 'auth.reauth_failed', summary: 'tenant.close', ...actor });
      throw err;
    }
    if (body.confirmName !== user.tenantName) {
      throw invalid('Le nom saisi ne correspond pas à l’espace de travail.', [
        { path: 'confirmName', rule: 'schema', message: 'Saisissez exactement le nom de l’espace de travail.' },
      ]);
    }
    // The addresses go away with the accounts, so the notice is sent first and awaited.
    for (const member of await this.auth.emailsOfTenant(user.tenantId)) {
      await this.mail.sendNow('workspaceClosed', member.email, { name: member.name, workspace: user.tenantName });
    }
    await this.auth.closeTenant(user.tenantId, info.ip, info.userAgent);
    res.append('Set-Cookie', this.sessions.clearCookie());
  }
}
