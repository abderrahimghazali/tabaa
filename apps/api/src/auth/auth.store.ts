import { Inject, Injectable } from '@nestjs/common';
import {
  AuthenticationStorage,
  type EmailTokenPurpose,
  type EmailTokenRecord,
  type EmailTokenStore,
  type SessionRecord,
  type SessionStore,
} from '@nestjs/authentication';
import { and, eq, lt, lte } from 'drizzle-orm';
import { emailTokens, memberships, sessions, tenants, users } from '../db/schema.js';
import { AuthDb } from './auth-db.js';
import type { AuthUser } from './auth-types.js';

function withoutNulls<T extends object>(row: T) {
  return Object.fromEntries(Object.entries(row).filter(([, v]) => v !== null)) as {
    [K in keyof T]: Exclude<T[K], null>;
  };
}

@Injectable()
export class AuthStore implements SessionStore, EmailTokenStore {
  constructor(
    @Inject(AuthDb) private readonly authDb: AuthDb,
    @Inject(AuthenticationStorage) storage: AuthenticationStorage,
  ) {
    storage.registerSource({ sessions: this, emailTokens: this });
  }

  private get db() {
    return this.authDb.db;
  }

  async getSession(id: string): Promise<SessionRecord | undefined> {
    const [row] = await this.db
      .select({ session: sessions, user: users, tenantName: tenants.name, role: memberships.role })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .innerJoin(tenants, eq(tenants.id, sessions.tenantId))
      .innerJoin(memberships, and(eq(memberships.userId, sessions.userId), eq(memberships.tenantId, sessions.tenantId)))
      .where(eq(sessions.id, id));
    if (!row) return undefined;
    const user: AuthUser = {
      id: row.user.id,
      name: row.user.name,
      email: row.user.email,
      tenantId: row.session.tenantId,
      tenantName: row.tenantName,
      role: row.role as AuthUser['role'],
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
}
