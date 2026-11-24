import { Body, Controller, Get, HttpCode, Inject, Post } from '@nestjs/common';
import {
  CurrentUser,
  PasswordResetService,
  Public,
  SignInService,
} from '@nestjs/authentication';
import { Throttle, SkipThrottle, hours, minutes } from '@nestjs/throttler';
import {
  ForgotPasswordInput,
  ResetPasswordInput,
  SignInInput,
  SignUpInput,
  type Me,
} from '@facture/core';
import { ApiException, invalid } from '../common/errors.js';
import type { AuthUser } from './auth-types.js';
import { AuthService, normalizeEmail, toMe } from './auth.service.js';
import { accountEmail } from './account-email.js';

@Controller()
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(SignInService) private readonly signInService: SignInService,
    @Inject(PasswordResetService) private readonly passwordReset: PasswordResetService,
  ) {}

  @Public()
  @SkipThrottle({ account: true })
  @Throttle({ default: { limit: 20, ttl: hours(1) } })
  @Post('auth/sign-up')
  async signUp(@Body({ schema: SignUpInput }) body: SignUpInput): Promise<Me> {
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
  async signIn(@Body({ schema: SignInInput }) body: SignInInput): Promise<Me> {
    const me = await this.auth.verify(body.email, body.password);
    if (!me) throw new ApiException(401, 'INVALID_CREDENTIALS', 'E-mail ou mot de passe incorrect.');
    await this.signInService.signIn(me.user.id, { method: 'password', metadata: { tenantId: me.tenant.id } });
    return me;
  }

  @Public()
  @HttpCode(204)
  @Post('auth/sign-out')
  async signOut() {
    await this.signInService.signOut();
  }

  @Public()
  @HttpCode(204)
  @Throttle({
    default: { limit: 10, ttl: minutes(15) },
    account: { limit: 3, ttl: minutes(15), getTracker: accountEmail },
  })
  @Post('auth/password/forgot')
  forgot(@Body({ schema: ForgotPasswordInput }) body: ForgotPasswordInput) {
    this.passwordReset.request(body.email);
  }

  @Public()
  @HttpCode(204)
  @Post('auth/password/reset')
  async reset(@Body({ schema: ResetPasswordInput }) body: ResetPasswordInput) {
    const result = await this.passwordReset.reset(body.token, body.password);
    if (!result) throw new ApiException(422, 'INVALID_TOKEN', 'Ce lien est invalide ou a expiré.');
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser): Me {
    return toMe(user);
  }
}
