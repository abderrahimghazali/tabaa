import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  AuthenticationRegistry,
  PasswordHasher,
  PasswordResetHandler,
  type PasswordResetLink,
} from '@nestjs/authentication';
import type { Me, Role } from '@facture/core';
import { asc, eq } from 'drizzle-orm';
import { memberships, tenants, users } from '../db/schema.js';
import { ApiException } from '../common/errors.js';
import { AuthDb } from './auth-db.js';
import type { AuthUser } from './auth-types.js';

export const normalizeEmail = (email: string) => email.trim().normalize('NFC').toLowerCase();

export const toMe = (u: AuthUser): Me => ({
  user: { id: u.id, name: u.name, email: u.email },
  tenant: { id: u.tenantId, name: u.tenantName },
  role: u.role,
});

@Injectable()
export class AuthService {
  constructor(
    @Inject(AuthDb) private readonly authDb: AuthDb,
    @Inject(PasswordHasher) private readonly hasher: PasswordHasher,
  ) {}

  async createAccount(input: {
    name: string;
    email: string;
    password: string;
    tenantName: string;
    tenantId?: string;
    role?: Role;
  }) {
    const email = normalizeEmail(input.email);
    const passwordHash = await this.hasher.hash(input.password);
    try {
      return await this.authDb.db.transaction(async (tx) => {
        const [tenant] = await tx
          .insert(tenants)
          .values({ ...(input.tenantId && { id: input.tenantId }), name: input.tenantName })
          .returning();
        const [user] = await tx.insert(users).values({ email, name: input.name, passwordHash }).returning();
        await tx.insert(memberships).values({ userId: user.id, tenantId: tenant.id, role: input.role ?? 'OWNER' });
        return { userId: user.id, tenantId: tenant.id };
      });
    } catch (err: any) {
      if (err?.cause?.code === '23505' && String(err.cause.constraint).includes('users_email')) {
        throw new ApiException(409, 'EMAIL_TAKEN', 'Un compte existe déjà avec cet e-mail.');
      }
      throw err;
    }
  }

  async verify(email: string, password: string) {
    const [row] = await this.authDb.db
      .select({ id: users.id, name: users.name, email: users.email, hash: users.passwordHash })
      .from(users)
      .where(eq(users.email, normalizeEmail(email)));
    const valid = await this.hasher.verify(password, row?.hash);
    if (!valid || !row) return null;
    const [membership] = await this.authDb.db
      .select({ tenantId: memberships.tenantId, tenantName: tenants.name, role: memberships.role })
      .from(memberships)
      .innerJoin(tenants, eq(tenants.id, memberships.tenantId))
      .where(eq(memberships.userId, row.id))
      .orderBy(asc(memberships.createdAt))
      .limit(1);
    if (!membership) return null;
    const me: Me = {
      user: { id: row.id, name: row.name, email: row.email },
      tenant: { id: membership.tenantId, name: membership.tenantName },
      role: membership.role as Role,
    };
    return me;
  }

  async findForReset(email: string) {
    const [row] = await this.authDb.db
      .select({ id: users.id, email: users.email, passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.email, normalizeEmail(email)));
    return row ?? null;
  }

  async updatePassword(userId: string, passwordHash: string) {
    await this.authDb.db.update(users).set({ passwordHash }).where(eq(users.id, userId));
  }
}

@Injectable()
export class PasswordResetMailer extends PasswordResetHandler {
  private readonly logger = new Logger('PasswordReset');

  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(AuthenticationRegistry) registry: AuthenticationRegistry,
  ) {
    super();
    registry.registerHandler('passwordReset', this);
  }

  findUser(email: string) {
    return this.auth.findForReset(email);
  }

  // No mail provider yet: the link goes to the log, never in production.
  send(link: PasswordResetLink) {
    if (process.env.NODE_ENV !== 'production') {
      this.logger.log(`Password reset link for ${link.email}: ${link.url}`);
    }
  }

  updatePassword(userId: string, passwordHash: string) {
    return this.auth.updatePassword(userId, passwordHash);
  }
}
