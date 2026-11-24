import { Inject, Injectable } from '@nestjs/common';
import { AuthenticationRegistry, SessionCookieProvider, type SessionRecord } from '@nestjs/authentication';
import type { AuthUser } from './auth-types.js';

@Injectable()
export class SessionAuth extends SessionCookieProvider<AuthUser> {
  constructor(@Inject(AuthenticationRegistry) registry: AuthenticationRegistry) {
    super();
    registry.registerProvider(this);
  }

  validate(session: SessionRecord) {
    return session.extra?.user ?? null;
  }
}
