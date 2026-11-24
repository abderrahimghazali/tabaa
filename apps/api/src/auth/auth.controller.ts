import { Body, Controller, Get, HttpCode, Inject, Post, Req } from '@nestjs/common';
import {
  Authenticate,
  CurrentUser,
  PasswordResetService,
  Public,
  SignInService,
} from '@nestjs/authentication';
import { Throttle, SkipThrottle, hours, minutes } from '@nestjs/throttler';
import { ForgotPasswordInput, ResetPasswordInput, SignInInput, SignUpInput, type Me } from '@facture/core';
import { AuditService } from '../audit/audit.service.js';
import { requestInfo } from '../common/client-ip.js';
import { ApiException, invalid } from '../common/errors.js';
import type { AuthUser } from './auth-types.js';
import { AuthService, normalizeEmail, toMe } from './auth.service.js';
import { env } from '../env.js';
import { signUpLimit } from './security-policy.js';
import { accountEmail } from './account-email.js';

@Controller()
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(SignInService) private readonly signInService: SignInService,
    @Inject(PasswordResetService) private readonly passwordReset: PasswordResetService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  @Public()
  @SkipThrottle({ account: true })
  @Throttle({ default: { limit: signUpLimit(env.nodeEnv), ttl: hours(1) } })
  @Post('auth/sign-up')
  async signUp(@Body({ schema: SignUpInput }) body: SignUpInput, @Req() req: any): Promise<Me> {
    if (normalizeEmail(body.password) === normalizeEmail(body.email)) {
      throw invalid('Données invalides.', [
        { path: 'password', rule: 'schema', message: 'Le mot de passe ne peut pas être votre adresse e-mail.' },
      ]);
    }
    const { userId, tenantId } = await this.auth.createAccount({
      name: body.name,
      email: body.email,
      password: body.password,
      tenantName: body.companyName,
    });
    await this.signInService.signIn(userId, { method: 'password', metadata: { tenantId } });
    await this.audit.recordDetached({
      action: 'auth.sign_up',
      tenantId,
      actorUserId: userId,
      actorName: body.name,
      entityType: 'user',
      entityId: userId,
      ...requestInfo(req),
    });
    return {
      user: { id: userId, name: body.name, email: normalizeEmail(body.email) },
      tenant: { id: tenantId, name: body.companyName },
      role: 'OWNER',
    };
  }

  @Public()
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: minutes(15) }, account: { limit: 10, ttl: minutes(15) } })
  @Post('auth/sign-in')
  async signIn(@Body({ schema: SignInInput }) body: SignInInput, @Req() req: any): Promise<Me> {
    const { me, known } = await this.auth.verify(body.email, body.password);
    const info = requestInfo(req);
    if (!me) {
      await this.audit.recordDetached({
        action: 'auth.sign_in_failed',
        tenantId: known?.tenantId,
        actorUserId: known?.userId,
        actorName: known?.name,
        summary: normalizeEmail(body.email).slice(0, 254),
        ...info,
      });
      throw new ApiException(401, 'INVALID_CREDENTIALS', 'E-mail ou mot de passe incorrect.');
    }
    await this.signInService.signIn(me.user.id, { method: 'password', metadata: { tenantId: me.tenant.id } });
    await this.audit.recordDetached({
      action: 'auth.sign_in',
      tenantId: me.tenant.id,
      actorUserId: me.user.id,
      actorName: me.user.name,
      ...info,
    });
    return me;
  }

  @Authenticate({ optional: true })
  @HttpCode(204)
  @Post('auth/sign-out')
  async signOut(@Req() req: any) {
    const user: AuthUser | undefined = req.user;
    await this.signInService.signOut();
    if (user) {
      await this.audit.recordDetached({
        action: 'auth.sign_out',
        tenantId: user.tenantId,
        actorUserId: user.id,
        actorName: user.name,
        ...requestInfo(req),
      });
    }
  }

  @HttpCode(204)
  @Post('auth/sign-out-all')
  async signOutAll(@CurrentUser() user: AuthUser, @Req() req: any) {
    await this.signInService.signOutEverywhere(user.id);
    await this.audit.recordDetached({
      action: 'auth.sign_out_all',
      tenantId: user.tenantId,
      actorUserId: user.id,
      actorName: user.name,
      ...requestInfo(req),
    });
  }

  @Public()
  @HttpCode(204)
  @Throttle({
    default: { limit: 10, ttl: minutes(15) },
    account: { limit: 3, ttl: minutes(15), getTracker: accountEmail },
  })
  @Post('auth/password/forgot')
  forgot(@Body({ schema: ForgotPasswordInput }) body: ForgotPasswordInput, @Req() req: any) {
    const info = requestInfo(req);
    this.passwordReset.request(body.email);
    // After the response: the lookup must not change the answer or its timing.
    void this.auth
      .findForReset(body.email)
      .then(async (user) => {
        const m = user ? await this.auth.membershipOf(user.id) : null;
        await this.audit.recordDetached({
          action: 'auth.password_reset_requested',
          tenantId: m?.tenantId,
          actorUserId: user?.id,
          actorName: m?.name,
          summary: normalizeEmail(body.email).slice(0, 254),
          ...info,
        });
      })
      .catch(() => undefined);
  }

  @Public()
  @HttpCode(204)
  @Post('auth/password/reset')
  async reset(@Body({ schema: ResetPasswordInput }) body: ResetPasswordInput, @Req() req: any) {
    const result = await this.passwordReset.reset(body.token, body.password);
    if (!result) throw new ApiException(422, 'INVALID_TOKEN', 'Ce lien est invalide ou a expiré.');
    const m = await this.auth.membershipOf(result.userId);
    await this.audit.recordDetached({
      action: 'auth.password_reset_completed',
      tenantId: m?.tenantId,
      actorUserId: result.userId,
      actorName: m?.name,
      ...requestInfo(req),
    });
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser): Me {
    return toMe(user);
  }
}
