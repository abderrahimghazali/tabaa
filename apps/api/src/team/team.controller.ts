import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Req } from '@nestjs/common';
import { Authenticate, CurrentSession, CurrentUser, Public, SignInService, type SessionRecord } from '@nestjs/authentication';
import { Throttle, minutes } from '@nestjs/throttler';
import { AcceptInvitationInput, ChangeRoleInput, InviteInput, type Me } from '@facture/core';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth-types.js';
import { AuthService } from '../auth/auth.service.js';
import { sensitiveLimit } from '../auth/security-policy.js';
import { requestInfo } from '../common/client-ip.js';
import { AllowViewer, Roles } from '../common/roles.js';
import { env } from '../env.js';
import { TeamService } from './team.service.js';

@Controller('team')
export class TeamController {
  constructor(@Inject(TeamService) private readonly service: TeamService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user);
  }

  @Post('invitations')
  @Roles('OWNER', 'ADMIN')
  invite(@Body({ schema: InviteInput }) body: InviteInput, @CurrentUser() user: AuthUser) {
    return this.service.invite(user, body);
  }

  @Post('invitations/:id/resend')
  @HttpCode(200)
  @Roles('OWNER', 'ADMIN')
  resend(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.resend(user, id);
  }

  @Delete('invitations/:id')
  @HttpCode(204)
  @Roles('OWNER', 'ADMIN')
  revoke(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.revoke(user, id);
  }

  @Patch('members/:userId')
  @Roles('OWNER', 'ADMIN')
  changeRole(@Param('userId') userId: string, @Body({ schema: ChangeRoleInput }) body: ChangeRoleInput, @CurrentUser() user: AuthUser) {
    return this.service.changeRole(user, userId, body.role);
  }

  // Any role may remove itself; removing someone else is checked in the service.
  @Delete('members/:userId')
  @HttpCode(204)
  @AllowViewer()
  remove(@Param('userId') userId: string, @CurrentUser() user: AuthUser) {
    return this.service.remove(user, userId);
  }
}

@Controller('auth/invitations')
export class InvitationsController {
  constructor(
    @Inject(TeamService) private readonly service: TeamService,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(SignInService) private readonly signInService: SignInService,
  ) {}

  @Public()
  @Throttle({ default: { limit: sensitiveLimit(env.nodeEnv, 30), ttl: minutes(15) } })
  @Get(':token')
  preview(@Param('token') token: string) {
    return this.service.preview(token);
  }

  @Authenticate({ optional: true })
  @AllowViewer()
  @HttpCode(200)
  @Throttle({ default: { limit: sensitiveLimit(env.nodeEnv, 20), ttl: minutes(15) } })
  @Post('accept')
  async accept(
    @Body({ schema: AcceptInvitationInput }) body: AcceptInvitationInput,
    @Req() req: any,
    @CurrentSession() session: SessionRecord | null,
  ): Promise<Me> {
    const user: AuthUser | undefined = req.user;
    const { me, newAccount } = await this.service.accept(body, { user: user ?? undefined, id: session?.id });
    if (newAccount) {
      await this.signInService.signIn(me.user.id, { method: 'password', metadata: { tenantId: me.tenant.id } });
    }
    await this.audit.recordDetached({
      action: 'team.joined',
      tenantId: me.tenant.id,
      actorUserId: me.user.id,
      actorName: me.user.name,
      entityType: 'user',
      entityId: me.user.id,
      summary: me.role,
      ...requestInfo(req),
    });
    return me;
  }
}
