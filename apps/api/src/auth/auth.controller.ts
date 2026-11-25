import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  Authenticate,
  CurrentSession,
  CurrentUser,
  MfaService,
  PasswordResetService,
  Public,
  SessionService,
  SignInService,
  type SessionRecord,
} from '@nestjs/authentication';
import { Throttle, SkipThrottle, hours, minutes } from '@nestjs/throttler';
import {
  ForgotPasswordInput,
  MfaEnableInput,
  MfaVerifyInput,
  Reauth,
  ResetPasswordInput,
  SignInInput,
  SignUpInput,
  VerifyEmailInput,
  type Me,
  type MfaSetup,
  type RecoveryCodes,
  type SignInResult,
  type SignUpAccepted,
} from '@facture/core';
import { AuditService } from '../audit/audit.service.js';
import { requestInfo } from '../common/client-ip.js';
import { readCookie } from '../common/cookies.js';
import { ApiException, conflict, invalid } from '../common/errors.js';
import { MailService } from '../mail/mail.service.js';
import type { AuthUser } from './auth-types.js';
import { AuthService, MFA_COOKIE, normalizeEmail, toMe } from './auth.service.js';
import { env } from '../env.js';
import { cookieSecure, sensitiveLimit, signInAccountLimit, signInIpLimit, signUpLimit } from './security-policy.js';
import { accountEmail } from './account-email.js';

@Controller()
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(SignInService) private readonly signInService: SignInService,
    @Inject(PasswordResetService) private readonly passwordReset: PasswordResetService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(MfaService) private readonly mfa: MfaService,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(MailService) private readonly mail: MailService,
  ) {}

  @Public()
  @HttpCode(202)
  @SkipThrottle({ account: true })
  @Throttle({ default: { limit: signUpLimit(env.nodeEnv), ttl: hours(1) } })
  @Post('auth/sign-up')
  async signUp(@Body({ schema: SignUpInput }) body: SignUpInput, @Req() req: any): Promise<SignUpAccepted> {
    if (normalizeEmail(body.password) === normalizeEmail(body.email)) {
      throw invalid('Données invalides.', [
        { path: 'password', rule: 'schema', message: 'Le mot de passe ne peut pas être votre adresse e-mail.' },
      ]);
    }
    await this.auth.startSignUp(body);
    await this.audit.recordDetached({
      action: 'auth.sign_up_requested',
      summary: normalizeEmail(body.email).slice(0, 254),
      ...requestInfo(req),
    });
    return { status: 'PENDING_VERIFICATION' };
  }

  @Public()
  @Throttle({ default: { limit: signInIpLimit(env.nodeEnv), ttl: minutes(15) } })
  @Post('auth/verify-email')
  async verifyEmail(@Body({ schema: VerifyEmailInput }) body: VerifyEmailInput, @Req() req: any): Promise<Me> {
    const me = await this.auth.completeSignUp(body.token);
    if (!me) throw new ApiException(422, 'INVALID_TOKEN', 'Ce lien est invalide ou a expiré.');
    await this.signInService.signIn(me.user.id, { method: 'password', metadata: { tenantId: me.tenant.id } });
    await this.audit.recordDetached({
      action: 'auth.sign_up',
      tenantId: me.tenant.id,
      actorUserId: me.user.id,
      actorName: me.user.name,
      entityType: 'user',
      entityId: me.user.id,
      ...requestInfo(req),
    });
    return me;
  }

  @Public()
  @HttpCode(200)
  @Throttle({ default: { limit: signInIpLimit(env.nodeEnv), ttl: minutes(15) }, account: { limit: signInAccountLimit(env.nodeEnv), ttl: minutes(15) } })
  @Post('auth/sign-in')
  async signIn(
    @Body({ schema: SignInInput }) body: SignInInput,
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SignInResult> {
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
    if (me.mfaEnabled) {
      const token = await this.auth.createChallenge(me.user.id, me.tenant.id);
      res.cookie(MFA_COOKIE, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: cookieSecure(env.nodeEnv),
        path: '/',
        maxAge: 5 * 60_000,
      });
      return { mfaRequired: true };
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

  @Public()
  @HttpCode(200)
  @Throttle({ default: { limit: sensitiveLimit(env.nodeEnv, 20), ttl: minutes(15) } })
  @Post('auth/mfa/verify')
  async mfaVerify(
    @Body({ schema: MfaVerifyInput }) body: MfaVerifyInput,
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Me> {
    const invalidCode = () => new ApiException(401, 'INVALID_CODE', 'Code de vérification invalide.');
    const token = readCookie(req, MFA_COOKIE);
    const challenge = token ? await this.auth.findChallenge(token) : null;
    if (!challenge) throw invalidCode();
    const info = requestInfo(req);
    const ok = body.code
      ? await this.mfa.verifyTotp(challenge.userId, body.code)
      : await this.mfa.verifyRecoveryCode(challenge.userId, body.recoveryCode!);
    const m = await this.auth.membershipOf(challenge.userId);
    if (!ok || !m) {
      await this.auth.failChallenge(challenge.id);
      await this.audit.recordDetached({
        action: 'auth.mfa_failed',
        tenantId: challenge.tenantId,
        actorUserId: challenge.userId,
        actorName: m?.name,
        summary: body.code ? 'code' : 'code de secours',
        ...info,
      });
      throw invalidCode();
    }
    if (!(await this.auth.consumeChallenge(challenge.id))) throw invalidCode();
    res.clearCookie(MFA_COOKIE, { path: '/' });
    const issued = await this.sessions.create(challenge.userId, { metadata: { tenantId: challenge.tenantId } });
    res.append('Set-Cookie', issued.cookie);
    const actor = { tenantId: challenge.tenantId, actorUserId: challenge.userId, actorName: m.name, ...info };
    await this.audit.recordDetached({ action: 'auth.sign_in', ...actor });
    if (body.recoveryCode) await this.audit.recordDetached({ action: 'auth.mfa_recovery_used', ...actor });
    return {
      user: { id: challenge.userId, name: m.name, email: m.email },
      tenant: { id: m.tenantId, name: m.tenantName },
      role: m.role as Me['role'],
      mfaEnabled: true,
    };
  }

  @Post('auth/mfa/setup')
  async mfaSetup(@CurrentUser() user: AuthUser): Promise<MfaSetup> {
    const { secret, uri } = await this.mfa.enroll(user.id, user.email);
    return { secret, otpauthUrl: uri };
  }

  @HttpCode(200)
  @Throttle({ default: { limit: sensitiveLimit(env.nodeEnv, 10), ttl: minutes(15) } })
  @Post('auth/mfa/enable')
  async mfaEnable(
    @Body({ schema: MfaEnableInput }) body: MfaEnableInput,
    @CurrentUser() user: AuthUser,
    @Req() req: any,
  ): Promise<RecoveryCodes> {
    if (!(await this.mfa.confirm(user.id, body.code))) {
      throw new ApiException(401, 'INVALID_CODE', 'Code de vérification invalide.');
    }
    const recoveryCodes = await this.mfa.generateRecoveryCodes(user.id);
    await this.audit.recordDetached({ action: 'auth.mfa_enabled', ...this.actor(user, req) });
    this.mail.queue('mfaEnabled', user.email, { name: user.name });
    return { recoveryCodes };
  }

  @HttpCode(204)
  @Throttle({ default: { limit: sensitiveLimit(env.nodeEnv, 10), ttl: minutes(15) } })
  @Post('auth/mfa/disable')
  async mfaDisable(
    @Body({ schema: Reauth }) body: Reauth,
    @CurrentUser() user: AuthUser,
    @CurrentSession() session: SessionRecord,
    @Req() req: any,
  ) {
    this.requireMfa(user);
    await this.reauth(user, body, req);
    await this.mfa.disable(user.id);
    await this.sessions.revokeAll(user.id, { except: session.id });
    await this.audit.recordDetached({ action: 'auth.mfa_disabled', ...this.actor(user, req) });
    this.mail.queue('mfaDisabled', user.email, { name: user.name });
  }

  @HttpCode(200)
  @Throttle({ default: { limit: sensitiveLimit(env.nodeEnv, 10), ttl: minutes(15) } })
  @Post('auth/mfa/recovery-codes')
  async mfaRecoveryCodes(
    @Body({ schema: Reauth }) body: Reauth,
    @CurrentUser() user: AuthUser,
    @Req() req: any,
  ): Promise<RecoveryCodes> {
    this.requireMfa(user);
    await this.reauth(user, body, req);
    const recoveryCodes = await this.mfa.generateRecoveryCodes(user.id);
    await this.audit.recordDetached({ action: 'auth.mfa_codes_regenerated', ...this.actor(user, req) });
    return { recoveryCodes };
  }

  private requireMfa(user: AuthUser) {
    if (!user.mfaEnabled) throw conflict('La double authentification n’est pas activée.');
  }

  private actor(user: AuthUser, req: any) {
    return { tenantId: user.tenantId, actorUserId: user.id, actorName: user.name, ...requestInfo(req) };
  }

  private async reauth(user: AuthUser, body: Reauth, req: any) {
    try {
      await this.auth.reauth(user, body);
    } catch (err) {
      await this.audit.recordDetached({ action: 'auth.reauth_failed', summary: String(req.path).slice(0, 80), ...this.actor(user, req) });
      throw err;
    }
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
