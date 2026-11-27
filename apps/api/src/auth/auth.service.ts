import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  AuthenticationRegistry,
  MfaService,
  PasswordHasher,
  PasswordResetHandler,
  type PasswordResetLink,
} from '@nestjs/authentication';
import type { Me, Role } from '@facture/core';
import { and, asc, eq, gt, isNull, sql } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import { ApiException } from '../common/errors.js';
import { memberships, mfaAuthenticators, mfaChallenges, pendingSignups, sessions, tenants, users } from '../db/schema.js';
import { MailService } from '../mail/mail.service.js';
import { AuthDb } from './auth-db.js';
import type { AuthUser } from './auth-types.js';

export const normalizeEmail = (email: string) => email.trim().normalize('NFC').toLowerCase();

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const newToken = () => randomBytes(32).toString('base64url');

export const MFA_COOKIE = 'tabaa_mfa';
const SIGN_UP_TTL_MS = 24 * 3600_000;
const CHALLENGE_TTL_MS = 5 * 60_000;
export const MAX_CHALLENGE_ATTEMPTS = 5;

@Injectable()
export class AuthService {
  constructor(
    @Inject(AuthDb) private readonly authDb: AuthDb,
    @Inject(PasswordHasher) private readonly hasher: PasswordHasher,
    @Inject(MailService) private readonly mail: MailService,
    @Inject(MfaService) private readonly mfa: MfaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  hashPassword(password: string) {
    return this.hasher.hash(password);
  }

  async createAccount(input: {
    name: string;
    email: string;
    passwordHash: string;
    tenantName: string;
    tenantId?: string;
    role?: Role;
    pendingId?: string;
  }) {
    const email = normalizeEmail(input.email);
    try {
      return await this.authDb.db.transaction(async (tx) => {
        if (input.pendingId) await tx.delete(pendingSignups).where(eq(pendingSignups.id, input.pendingId));
        const [tenant] = await tx
          .insert(tenants)
          .values({ ...(input.tenantId && { id: input.tenantId }), name: input.tenantName })
          .returning();
        const [user] = await tx
          .insert(users)
          .values({ email, name: input.name, passwordHash: input.passwordHash })
          .returning();
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

  async createTenant(input: { name: string; id?: string }) {
    await this.authDb.db.insert(tenants).values({ ...(input.id && { id: input.id }), name: input.name });
  }

  async addMembership(userId: string, tenantId: string, role: Role) {
    await this.authDb.db.insert(memberships).values({ userId, tenantId, role });
  }

  async addMember(input: { name: string; email: string; passwordHash: string; tenantId: string; role: Role }) {
    const [user] = await this.authDb.db
      .insert(users)
      .values({ email: normalizeEmail(input.email), name: input.name, passwordHash: input.passwordHash })
      .returning();
    await this.authDb.db.insert(memberships).values({ userId: user.id, tenantId: input.tenantId, role: input.role });
    return user.id;
  }

  // Same work, same answer for a new and an existing address: only the email differs.
  async startSignUp(input: { name: string; email: string; password: string; companyName: string }) {
    const email = normalizeEmail(input.email);
    const passwordHash = await this.hasher.hash(input.password);
    const token = newToken();
    const [existing] = await this.authDb.db.select({ id: users.id, name: users.name }).from(users).where(eq(users.email, email));
    if (existing) {
      this.mail.queue('accountExists', email, { name: existing.name });
      return;
    }
    const values = {
      email,
      name: input.name,
      companyName: input.companyName,
      passwordHash,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + SIGN_UP_TTL_MS),
    };
    await this.authDb.db
      .insert(pendingSignups)
      .values(values)
      .onConflictDoUpdate({ target: pendingSignups.email, set: { ...values, createdAt: new Date() } });
    this.mail.queue('verifyEmail', email, { name: input.name, token });
  }

  async completeSignUp(token: string): Promise<Me | null> {
    const [pending] = await this.authDb.db
      .delete(pendingSignups)
      .where(and(eq(pendingSignups.tokenHash, sha256(token)), gt(pendingSignups.expiresAt, new Date())))
      .returning();
    if (!pending) return null;
    try {
      const { userId, tenantId } = await this.createAccount({
        name: pending.name,
        email: pending.email,
        passwordHash: pending.passwordHash,
        tenantName: pending.companyName,
      });
      await this.touchMembership(userId, tenantId);
      return {
        user: { id: userId, name: pending.name, email: pending.email },
        tenant: { id: tenantId, name: pending.companyName },
        role: 'OWNER',
        mfaEnabled: false,
        memberships: [{ tenantId, tenantName: pending.companyName, role: 'OWNER' }],
      };
    } catch (err) {
      if (err instanceof ApiException) return null;
      throw err;
    }
  }

  // The workspace to sign in to: the one asked for, else the most recently used, else the oldest.
  async membershipOf(userId: string, tenantId?: string) {
    const [row] = await this.authDb.db
      .select({
        tenantId: memberships.tenantId,
        tenantName: tenants.name,
        role: memberships.role,
        name: users.name,
        email: users.email,
        mfa: mfaAuthenticators.confirmed,
      })
      .from(memberships)
      .innerJoin(tenants, eq(tenants.id, memberships.tenantId))
      .innerJoin(users, eq(users.id, memberships.userId))
      .leftJoin(mfaAuthenticators, eq(mfaAuthenticators.userId, memberships.userId))
      .where(and(eq(memberships.userId, userId), isNull(tenants.closedAt), tenantId ? eq(memberships.tenantId, tenantId) : undefined))
      .orderBy(sql`${memberships.lastUsedAt} desc nulls last`, asc(memberships.createdAt))
      .limit(1);
    return row ?? null;
  }

  async meFor(userId: string, tenantId?: string): Promise<Me | null> {
    const m = await this.membershipOf(userId, tenantId);
    if (!m) return null;
    const all = await this.authDb.db
      .select({ tenantId: memberships.tenantId, tenantName: tenants.name, role: memberships.role })
      .from(memberships)
      .innerJoin(tenants, eq(tenants.id, memberships.tenantId))
      .where(and(eq(memberships.userId, userId), isNull(tenants.closedAt)))
      .orderBy(asc(memberships.createdAt));
    return {
      user: { id: userId, name: m.name, email: m.email },
      tenant: { id: m.tenantId, name: m.tenantName },
      role: m.role as Role,
      mfaEnabled: m.mfa === true,
      memberships: all.map((a) => ({ ...a, role: a.role as Role })),
    };
  }

  async touchMembership(userId: string, tenantId: string) {
    await this.authDb.db
      .update(memberships)
      .set({ lastUsedAt: new Date() })
      .where(and(eq(memberships.userId, userId), eq(memberships.tenantId, tenantId)));
  }

  async switchTenant(sessionId: string, userId: string, tenantId: string): Promise<boolean> {
    if (!(await this.membershipOf(userId, tenantId))) return false;
    await this.authDb.db.update(sessions).set({ tenantId }).where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)));
    await this.touchMembership(userId, tenantId);
    return true;
  }

  async verify(email: string, password: string) {
    const [row] = await this.authDb.db
      .select({ id: users.id, hash: users.passwordHash })
      .from(users)
      .where(eq(users.email, normalizeEmail(email)));
    const valid = await this.hasher.verify(password, row?.hash);
    const membership = row ? await this.membershipOf(row.id) : null;
    const known = row && membership ? { userId: row.id, name: membership.name, tenantId: membership.tenantId } : undefined;
    if (!valid || !row || !membership) return { me: null, known };
    return { me: await this.meFor(row.id, membership.tenantId), known };
  }

  // Password, plus a current code when two-factor is on. Throws a fixed-shape 401.
  async reauth(user: AuthUser, input: { password: string; code?: string }) {
    const [row] = await this.authDb.db.select({ hash: users.passwordHash }).from(users).where(eq(users.id, user.id));
    const valid = await this.hasher.verify(input.password, row?.hash);
    if (!valid) throw new ApiException(401, 'INVALID_CREDENTIALS', 'Mot de passe incorrect.');
    if (user.mfaEnabled && !(input.code && (await this.mfa.verifyTotp(user.id, input.code)))) {
      throw new ApiException(401, 'INVALID_CODE', 'Code de vérification invalide.');
    }
  }

  async createChallenge(userId: string, tenantId: string) {
    const token = newToken();
    await this.authDb.db.insert(mfaChallenges).values({
      id: sha256(token),
      userId,
      tenantId,
      expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
    });
    return token;
  }

  async findChallenge(token: string) {
    const [row] = await this.authDb.db
      .select()
      .from(mfaChallenges)
      .where(and(eq(mfaChallenges.id, sha256(token)), gt(mfaChallenges.expiresAt, new Date())));
    return row ?? null;
  }

  // Counts the failure and drops the challenge on the fifth.
  async failChallenge(id: string) {
    const [row] = await this.authDb.db
      .update(mfaChallenges)
      .set({ attempts: sql`${mfaChallenges.attempts} + 1` })
      .where(eq(mfaChallenges.id, id))
      .returning({ attempts: mfaChallenges.attempts });
    if (row && row.attempts >= MAX_CHALLENGE_ATTEMPTS) {
      await this.authDb.db.delete(mfaChallenges).where(eq(mfaChallenges.id, id));
    }
  }

  async consumeChallenge(id: string) {
    const rows = await this.authDb.db.delete(mfaChallenges).where(eq(mfaChallenges.id, id)).returning({ id: mfaChallenges.id });
    return rows.length === 1;
  }

  async findForReset(email: string) {
    const [row] = await this.authDb.db
      .select({ id: users.id, email: users.email, passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.email, normalizeEmail(email)));
    return row ?? null;
  }

  async updatePassword(userId: string, passwordHash: string) {
    const [row] = await this.authDb.db
      .update(users)
      .set({ passwordHash })
      .where(eq(users.id, userId))
      .returning({ email: users.email, name: users.name });
    if (row) this.mail.queue('passwordChanged', row.email, { name: row.name });
  }

  async emailsOfTenant(tenantId: string) {
    return this.authDb.db
      .select({ email: users.email, name: users.name })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.tenantId, tenantId));
  }

  async closeTenant(tenantId: string, ip: string | undefined, userAgent: string | undefined) {
    await this.authDb.db.execute(sql`select close_tenant(${tenantId}::uuid, now(), ${ip ?? null}, ${userAgent ?? null})`);
  }
}

@Injectable()
export class PasswordResetMailer extends PasswordResetHandler {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(MailService) private readonly mail: MailService,
    @Inject(AuthenticationRegistry) registry: AuthenticationRegistry,
  ) {
    super();
    registry.registerHandler('passwordReset', this);
  }

  findUser(email: string) {
    return this.auth.findForReset(email);
  }

  send(link: PasswordResetLink) {
    this.mail.queue('passwordReset', link.email, { url: link.url });
  }

  updatePassword(userId: string, passwordHash: string) {
    return this.auth.updatePassword(userId, passwordHash);
  }
}
