import { Inject, Injectable } from '@nestjs/common';
import {
  AuthenticationStorage,
  type EmailTokenPurpose,
  type EmailTokenRecord,
  type EmailTokenStore,
  type MfaStore,
  type SessionRecord,
  type SessionStore,
  type TotpRecord,
} from '@nestjs/authentication';
import { and, eq, gt, isNull, lt, lte, or, sql } from 'drizzle-orm';
import {
  emailTokens,
  memberships,
  mfaAuthenticators,
  mfaFailures,
  mfaRecoveryCodes,
  sessions,
  tenants,
  users,
} from '../db/schema.js';
import { AuthDb } from './auth-db.js';
import type { AuthUser } from './auth-types.js';

function withoutNulls<T extends object>(row: T) {
  return Object.fromEntries(Object.entries(row).filter(([, v]) => v !== null)) as {
    [K in keyof T]: Exclude<T[K], null>;
  };
}

@Injectable()
export class AuthStore implements SessionStore, EmailTokenStore, MfaStore {
  constructor(
    @Inject(AuthDb) private readonly authDb: AuthDb,
    @Inject(AuthenticationStorage) storage: AuthenticationStorage,
  ) {
    storage.registerSource({ sessions: this, emailTokens: this, mfa: this });
  }

  private get db() {
    return this.authDb.db;
  }

  async getSession(id: string): Promise<SessionRecord | undefined> {
    const [row] = await this.db
      .select({
        session: sessions,
        user: users,
        tenantName: tenants.name,
        role: memberships.role,
        mfa: mfaAuthenticators.confirmed,
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .innerJoin(tenants, eq(tenants.id, sessions.tenantId))
      .innerJoin(memberships, and(eq(memberships.userId, sessions.userId), eq(memberships.tenantId, sessions.tenantId)))
      .leftJoin(mfaAuthenticators, eq(mfaAuthenticators.userId, sessions.userId))
      .where(and(eq(sessions.id, id), isNull(tenants.closedAt)));
    if (!row) return undefined;
    const user: AuthUser = {
      id: row.user.id,
      name: row.user.name,
      email: row.user.email,
      tenantId: row.session.tenantId,
      tenantName: row.tenantName,
      role: row.role as AuthUser['role'],
      mfaEnabled: row.mfa === true,
    };
    const { id: sid, userId, createdAt, expiresAt, lastActiveAt, metadata } = row.session;
    return { id: sid, userId, createdAt, expiresAt, lastActiveAt, ...(metadata && { metadata }), extra: { user } };
  }

  async createSession(record: SessionRecord): Promise<void> {
    const tenantId = record.metadata?.tenantId;
    if (typeof tenantId !== 'string') throw new Error('Session without tenant');
    await this.db.insert(sessions).values({
      id: record.id,
      userId: record.userId,
      tenantId,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
      lastActiveAt: record.lastActiveAt,
      metadata: record.metadata,
    });
    await this.db.delete(sessions).where(lte(sessions.expiresAt, record.createdAt));
  }

  async touchSession(id: string, lastActiveAt: Date): Promise<void> {
    await this.db
      .update(sessions)
      .set({ lastActiveAt })
      .where(and(eq(sessions.id, id), lt(sessions.lastActiveAt, lastActiveAt)));
  }

  async deleteSession(id: string): Promise<boolean> {
    const deleted = await this.db.delete(sessions).where(eq(sessions.id, id)).returning({ id: sessions.id });
    return deleted.length > 0;
  }

  async listUserSessions(userId: string): Promise<SessionRecord[]> {
    const rows = await this.db.select().from(sessions).where(eq(sessions.userId, userId));
    return rows.map(({ tenantId: _t, mfa: _m, metadata, ...r }) => ({ ...r, ...(metadata && { metadata }) }));
  }

  async deleteUserSessions(userId: string): Promise<void> {
    await this.db.delete(sessions).where(eq(sessions.userId, userId));
  }

  async saveEmailToken(record: EmailTokenRecord): Promise<void> {
    await this.db.insert(emailTokens).values(record);
    await this.db.delete(emailTokens).where(lte(emailTokens.expiresAt, record.createdAt));
  }

  async consumeEmailToken(id: string, purpose: EmailTokenPurpose): Promise<EmailTokenRecord | undefined> {
    const [row] = await this.db
      .delete(emailTokens)
      .where(and(eq(emailTokens.id, id), eq(emailTokens.purpose, purpose)))
      .returning();
    return row && (withoutNulls(row) as EmailTokenRecord);
  }

  async deleteUserEmailTokens(userId: string, purpose: EmailTokenPurpose): Promise<void> {
    await this.db.delete(emailTokens).where(and(eq(emailTokens.userId, userId), eq(emailTokens.purpose, purpose)));
  }

  // Two-factor state

  async getTotp(userId: string): Promise<TotpRecord | undefined> {
    const [row] = await this.db.select().from(mfaAuthenticators).where(eq(mfaAuthenticators.userId, userId));
    if (!row) return undefined;
    const { userId: _u, ...totp } = withoutNulls(row) as typeof row;
    return { ...totp, pendingSecret: totp.pendingSecret ?? undefined, lastUsedStep: totp.lastUsedStep ?? undefined };
  }

  async saveTotp(userId: string, record: TotpRecord | null): Promise<void> {
    if (!record) {
      await this.db.delete(mfaAuthenticators).where(eq(mfaAuthenticators.userId, userId));
      return;
    }
    const values = { secret: record.secret, confirmed: record.confirmed, pendingSecret: record.pendingSecret ?? null };
    await this.db
      .insert(mfaAuthenticators)
      .values({ userId, ...values, lastUsedStep: record.lastUsedStep })
      .onConflictDoUpdate({
        target: mfaAuthenticators.userId,
        set: { ...values, lastUsedStep: sql`greatest(${mfaAuthenticators.lastUsedStep}, excluded.last_used_step)` },
      });
  }

  async claimTotpStep(userId: string, step: number): Promise<boolean> {
    const claimed = await this.db
      .update(mfaAuthenticators)
      .set({ lastUsedStep: step })
      .where(
        and(
          eq(mfaAuthenticators.userId, userId),
          or(isNull(mfaAuthenticators.lastUsedStep), lt(mfaAuthenticators.lastUsedStep, step)),
        ),
      )
      .returning({ userId: mfaAuthenticators.userId });
    return claimed.length === 1;
  }

  async saveRecoveryCodes(userId: string, hashes: string[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.userId, userId));
      if (hashes.length > 0) {
        await tx.insert(mfaRecoveryCodes).values([...new Set(hashes)].map((codeHash) => ({ userId, codeHash })));
      }
    });
  }

  async consumeRecoveryCode(userId: string, hash: string): Promise<boolean> {
    const consumed = await this.db
      .delete(mfaRecoveryCodes)
      .where(and(eq(mfaRecoveryCodes.userId, userId), eq(mfaRecoveryCodes.codeHash, hash)))
      .returning({ userId: mfaRecoveryCodes.userId });
    return consumed.length === 1;
  }

  countRecoveryCodes(userId: string): Promise<number> {
    return this.db.$count(mfaRecoveryCodes, eq(mfaRecoveryCodes.userId, userId));
  }

  async recordMfaFailure(userId: string, windowMs: number, now: number): Promise<number> {
    await this.db.insert(mfaFailures).values({ userId, failedAt: new Date(now) });
    const failures = await this.countMfaFailures(userId, windowMs, now);
    await this.db.delete(mfaFailures).where(lte(mfaFailures.failedAt, new Date(now - windowMs)));
    return failures;
  }

  countMfaFailures(userId: string, windowMs: number, now: number): Promise<number> {
    return this.db.$count(
      mfaFailures,
      and(eq(mfaFailures.userId, userId), gt(mfaFailures.failedAt, new Date(now - windowMs))),
    );
  }

  async clearMfaFailures(userId: string): Promise<void> {
    await this.db.delete(mfaFailures).where(eq(mfaFailures.userId, userId));
  }
}
