import { Inject, Injectable } from '@nestjs/common';
import type { AuditEvent } from '@facture/core';
import { and, desc, eq, lt } from 'drizzle-orm';
import { AuthDb } from '../auth/auth-db.js';
import { auditEvents } from '../db/schema.js';
import { TenantDb } from '../db/tenant-db.js';

export interface EventInput {
  action: string;
  entityType?: string;
  entityId?: string;
  summary?: string;
}

export interface DetachedEvent extends EventInput {
  tenantId?: string | null;
  actorUserId?: string | null;
  actorName?: string | null;
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class AuditService {
  constructor(
    @Inject(TenantDb) private readonly t: TenantDb,
    @Inject(AuthDb) private readonly authDb: AuthDb,
  ) {}

  // Inside the request's tenant transaction: the event commits or rolls back with the change.
  async record(e: EventInput) {
    const { userId, userName, ip, userAgent } = this.t.ctx;
    await this.t.tx.insert(auditEvents).values({
      tenantId: this.t.tenantId,
      actorUserId: userId ?? null,
      actorName: userName ?? null,
      action: e.action,
      entityType: e.entityType ?? null,
      entityId: e.entityId ?? null,
      summary: e.summary ?? null,
      ip: ip ?? null,
      userAgent: userAgent ?? null,
    });
  }

  // Authentication and denial events: no tenant transaction exists (or it is not trusted yet).
  async recordDetached(e: DetachedEvent) {
    await this.authDb.db.insert(auditEvents).values({
      tenantId: e.tenantId ?? null,
      actorUserId: e.actorUserId ?? null,
      actorName: e.actorName ?? null,
      action: e.action,
      entityType: e.entityType ?? null,
      entityId: e.entityId ?? null,
      summary: e.summary ?? null,
      ip: e.ip ?? null,
      userAgent: e.userAgent ?? null,
    });
  }

  async list(limit: number, before?: Date): Promise<AuditEvent[]> {
    const rows = await this.t.tx
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.tenantId, this.t.tenantId), before ? lt(auditEvents.createdAt, before) : undefined))
      .orderBy(desc(auditEvents.createdAt), desc(auditEvents.id))
      .limit(limit);
    return rows.map((r) => ({
      id: r.id,
      at: r.createdAt.toISOString(),
      actorName: r.actorName,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      summary: r.summary,
      ip: r.ip,
    }));
  }
}
