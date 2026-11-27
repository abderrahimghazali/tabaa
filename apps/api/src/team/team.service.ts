import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { PasswordHasher } from '@nestjs/authentication';
import type { Invitation, InvitationPreview, InviteInput, Me, Role, Team, TeamMember } from '@facture/core';
import { and, asc, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import { AuthDb } from '../auth/auth-db.js';
import type { AuthUser } from '../auth/auth-types.js';
import { AuthService, normalizeEmail } from '../auth/auth.service.js';
import { ApiException, invalid, notFound } from '../common/errors.js';
import { invitations, memberships, mfaAuthenticators, pendingSignups, sessions, tenants, users } from '../db/schema.js';
import { TenantDb } from '../db/tenant-db.js';
import { MailService } from '../mail/mail.service.js';

const INVITATION_TTL_MS = 7 * 24 * 3600_000;
const DAILY_INVITE_LIMIT = 30;
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const newToken = () => randomBytes(32).toString('base64url');
const forbidden = (message: string) => new ApiException(403, 'FORBIDDEN', message);
const invalidToken = () => new ApiException(404, 'INVALID_TOKEN', 'Cette invitation est invalide ou a expiré.');
const isManager = (role: Role) => role === 'OWNER' || role === 'ADMIN';

type InvitationRow = typeof invitations.$inferSelect;
const toInvitation = (r: InvitationRow): Invitation => ({
  id: r.id,
  email: r.email,
  role: r.role as Role,
  invitedByName: r.invitedByName,
  createdAt: r.createdAt.toISOString(),
  expiresAt: r.expiresAt.toISOString(),
});

@Injectable()
export class TeamService {
  constructor(
    @Inject(TenantDb) private readonly t: TenantDb,
    @Inject(AuthDb) private readonly authDb: AuthDb,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(MailService) private readonly mail: MailService,
    @Inject(PasswordHasher) private readonly hasher: PasswordHasher,
  ) {}

  private get db() {
    return this.authDb.db;
  }

  private memberOf(user: AuthUser, row: { userId: string; name: string; email: string; role: string; joinedAt: Date; mfa: boolean | null }): TeamMember {
    return {
      userId: row.userId,
      name: row.name,
      email: row.email,
      role: row.role as Role,
      joinedAt: row.joinedAt.toISOString(),
      mfaEnabled: row.mfa === true,
      isYou: row.userId === user.id,
    };
  }

  private async members(tenantId: string, userId?: string) {
    return this.db
      .select({
        userId: users.id,
        name: users.name,
        email: users.email,
        role: memberships.role,
        joinedAt: memberships.createdAt,
        mfa: mfaAuthenticators.confirmed,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .leftJoin(mfaAuthenticators, eq(mfaAuthenticators.userId, users.id))
      .where(and(eq(memberships.tenantId, tenantId), userId ? eq(memberships.userId, userId) : undefined))
      .orderBy(asc(memberships.createdAt), asc(users.name));
  }

  async list(user: AuthUser): Promise<Team> {
    const members = (await this.members(user.tenantId)).map((m) => this.memberOf(user, m));
    if (!isManager(user.role)) return { members, invitations: [] };
    const open = await this.t.tx
      .select()
      .from(invitations)
      .where(and(isNull(invitations.acceptedAt), isNull(invitations.revokedAt)))
      .orderBy(desc(invitations.createdAt));
    return { members, invitations: open.map(toInvitation) };
  }

  private async open(id: string) {
    const [row] = await this.t.tx
      .select()
      .from(invitations)
      .where(and(eq(invitations.id, id), isNull(invitations.acceptedAt), isNull(invitations.revokedAt)))
      .for('update');
    if (!row) throw notFound('Invitation');
    return row;
  }

  private sendInvitation(user: AuthUser, row: InvitationRow, token: string) {
    this.mail.queue('invitation', row.email, {
      workspace: user.tenantName,
      inviter: user.name,
      role: row.role as Role,
      token,
      expiresAt: row.expiresAt,
    });
  }

  async invite(user: AuthUser, input: InviteInput): Promise<Invitation> {
    if (input.role === 'OWNER' && user.role !== 'OWNER') throw forbidden('Seul un propriétaire peut inviter un propriétaire.');
    const email = normalizeEmail(input.email);
    const [member] = await this.db
      .select({ id: users.id })
      .from(users)
      .innerJoin(memberships, eq(memberships.userId, users.id))
      .where(and(eq(users.email, email), eq(memberships.tenantId, user.tenantId)));
    if (member) throw new ApiException(409, 'ALREADY_MEMBER', 'Cette personne fait déjà partie de l’espace de travail.');

    const tx = this.t.tx;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`invite:${user.tenantId}`}))`);
    const recent = await tx.$count(invitations, gt(invitations.createdAt, sql`now() - interval '1 day'`));
    if (recent >= DAILY_INVITE_LIMIT) {
      throw new ApiException(429, 'INVITE_LIMIT', 'Limite d’invitations atteinte pour aujourd’hui, réessayez demain.');
    }
    const token = newToken();
    const rows = await tx
      .insert(invitations)
      .values({
        tenantId: user.tenantId,
        email,
        role: input.role,
        tokenHash: sha256(token),
        invitedBy: user.id,
        invitedByName: user.name,
        expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
      })
      .onConflictDoNothing()
      .returning();
    if (!rows.length) throw new ApiException(409, 'ALREADY_INVITED', 'Une invitation est déjà en cours pour cette adresse : renvoyez-la plutôt.');
    await this.audit.record({ action: 'team.invited', entityType: 'invitation', entityId: rows[0].id, summary: `${email} (${input.role})` });
    this.sendInvitation(user, rows[0], token);
    return toInvitation(rows[0]);
  }

  private guardOwnerInvitation(user: AuthUser, row: InvitationRow) {
    if (row.role === 'OWNER' && user.role !== 'OWNER') throw forbidden('Seul un propriétaire peut gérer une invitation de propriétaire.');
  }

  async resend(user: AuthUser, id: string): Promise<Invitation> {
    const row = await this.open(id);
    this.guardOwnerInvitation(user, row);
    const token = newToken();
    const [updated] = await this.t.tx
      .update(invitations)
      .set({ tokenHash: sha256(token), expiresAt: new Date(Date.now() + INVITATION_TTL_MS) })
      .where(eq(invitations.id, id))
      .returning();
    this.sendInvitation(user, updated, token);
    return toInvitation(updated);
  }

  async revoke(user: AuthUser, id: string) {
    const row = await this.open(id);
    this.guardOwnerInvitation(user, row);
    await this.t.tx.update(invitations).set({ revokedAt: new Date() }).where(eq(invitations.id, id));
    await this.audit.record({ action: 'team.invitation_revoked', entityType: 'invitation', entityId: id, summary: `${row.email} (${row.role})` });
  }

  // Locks the OWNER rows of the workspace, so two concurrent demotions or removals cannot both see "another owner remains".
  private async lockedOwners(tx: Parameters<Parameters<AuthDb['db']['transaction']>[0]>[0], tenantId: string) {
    return tx
      .select({ userId: memberships.userId })
      .from(memberships)
      .where(and(eq(memberships.tenantId, tenantId), eq(memberships.role, 'OWNER')))
      .for('update');
  }

  async changeRole(user: AuthUser, userId: string, role: Role): Promise<TeamMember> {
    if (role === 'OWNER' && user.role !== 'OWNER') throw forbidden('Seul un propriétaire peut attribuer le rôle de propriétaire.');
    const before = await this.db.transaction(async (tx) => {
      const owners = await this.lockedOwners(tx, user.tenantId);
      const [target] = await tx
        .select({ role: memberships.role })
        .from(memberships)
        .where(and(eq(memberships.tenantId, user.tenantId), eq(memberships.userId, userId)))
        .for('update');
      if (!target) throw notFound('Membre');
      if (target.role === 'OWNER' && user.role !== 'OWNER') throw forbidden('Seul un propriétaire peut modifier un propriétaire.');
      if (target.role === 'OWNER' && role !== 'OWNER' && owners.length <= 1) {
        throw new ApiException(409, 'LAST_OWNER', 'L’espace de travail doit conserver au moins un propriétaire.');
      }
      if (target.role !== role) {
        await tx
          .update(memberships)
          .set({ role })
          .where(and(eq(memberships.tenantId, user.tenantId), eq(memberships.userId, userId)));
      }
      return target.role;
    });
    const [row] = await this.members(user.tenantId, userId);
    if (before !== role) {
      await this.audit.record({ action: 'team.role_changed', entityType: 'user', entityId: userId, summary: `${row.name} : ${before} → ${role}` });
      if (userId !== user.id) this.mail.queue('roleChanged', row.email, { name: row.name, workspace: user.tenantName, role });
    }
    return this.memberOf(user, row);
  }

  async remove(user: AuthUser, userId: string) {
    const self = userId === user.id;
    if (!self && !isManager(user.role)) throw forbidden('Votre rôle ne permet pas cette action.');
    const [info] = await this.members(user.tenantId, userId);
    if (!info) throw notFound('Membre');
    await this.db.transaction(async (tx) => {
      const owners = await this.lockedOwners(tx, user.tenantId);
      const [target] = await tx
        .select({ role: memberships.role })
        .from(memberships)
        .where(and(eq(memberships.tenantId, user.tenantId), eq(memberships.userId, userId)))
        .for('update');
      if (!target) throw notFound('Membre');
      if (target.role === 'OWNER' && !self && user.role !== 'OWNER') throw forbidden('Seul un propriétaire peut retirer un propriétaire.');
      if (target.role === 'OWNER' && owners.length <= 1) {
        throw new ApiException(409, 'LAST_OWNER', 'L’espace de travail doit conserver au moins un propriétaire.');
      }
      await tx.delete(memberships).where(and(eq(memberships.tenantId, user.tenantId), eq(memberships.userId, userId)));
      await tx.delete(sessions).where(and(eq(sessions.userId, userId), eq(sessions.tenantId, user.tenantId)));
    });
    await this.audit.record({
      action: 'team.member_removed',
      entityType: 'user',
      entityId: userId,
      summary: self ? `${info.name} a quitté l’espace` : `${info.name} retiré`,
    });
    if (!self) this.mail.queue('memberRemoved', info.email, { name: info.name, workspace: user.tenantName });
  }

  // Public: the token is the credential. Closed workspaces and used, revoked or expired links all answer the same.
  private async findOpen(token: string) {
    const [row] = await this.db
      .select({ inv: invitations, tenantName: tenants.name })
      .from(invitations)
      .innerJoin(tenants, eq(tenants.id, invitations.tenantId))
      .where(
        and(
          eq(invitations.tokenHash, sha256(token)),
          isNull(invitations.acceptedAt),
          isNull(invitations.revokedAt),
          gt(invitations.expiresAt, new Date()),
          isNull(tenants.closedAt),
        ),
      );
    if (!row) throw invalidToken();
    return row;
  }

  async preview(token: string): Promise<InvitationPreview> {
    const { inv, tenantName } = await this.findOpen(token);
    const [existing] = await this.db.select({ id: users.id }).from(users).where(eq(users.email, inv.email));
    return { tenantName, email: inv.email, role: inv.role as Role, inviterName: inv.invitedByName, accountExists: !!existing };
  }

  // Returns the new session's Me, and whether a fresh sign-in is needed (new account) or the current session switches.
  async accept(
    input: { token: string; name?: string; password?: string },
    session: { user?: AuthUser; id?: string },
  ): Promise<{ me: Me; newAccount: boolean; role: Role; workspace: string }> {
    const { inv, tenantName } = await this.findOpen(input.token);
    const [existing] = await this.db.select().from(users).where(eq(users.email, inv.email));
    let passwordHash: string | undefined;
    if (existing) {
      if (!session.user) throw new ApiException(401, 'SIGN_IN_REQUIRED', 'Connectez-vous avec le compte invité pour accepter.');
      if (normalizeEmail(session.user.email) !== inv.email) {
        throw new ApiException(403, 'WRONG_ACCOUNT', 'Cette invitation est destinée à une autre adresse e-mail.');
      }
    } else {
      const issues = [
        ...(input.name ? [] : [{ path: 'name', rule: 'schema', message: 'Le nom est requis.' }]),
        ...(input.password ? [] : [{ path: 'password', rule: 'schema', message: 'Le mot de passe est requis.' }]),
        ...(input.password && normalizeEmail(input.password) === inv.email
          ? [{ path: 'password', rule: 'schema', message: 'Le mot de passe ne peut pas être votre adresse e-mail.' }]
          : []),
      ];
      if (issues.length) throw invalid('Données invalides.', issues);
      passwordHash = await this.hasher.hash(input.password!);
    }

    const userId = await this.db
      .transaction(async (tx) => {
        const claimed = await tx
          .update(invitations)
          .set({ acceptedAt: new Date() })
          .where(and(eq(invitations.id, inv.id), isNull(invitations.acceptedAt), isNull(invitations.revokedAt), gt(invitations.expiresAt, new Date())))
          .returning({ id: invitations.id });
        if (!claimed.length) throw invalidToken();
        let id = existing?.id;
        if (!id) {
          [{ id }] = await tx.insert(users).values({ email: inv.email, name: input.name!, passwordHash: passwordHash! }).returning({ id: users.id });
          await tx.delete(pendingSignups).where(eq(pendingSignups.email, inv.email));
        }
        await tx.insert(memberships).values({ userId: id, tenantId: inv.tenantId, role: inv.role, lastUsedAt: new Date() });
        return id;
      })
      .catch((err: any) => {
        if (err?.cause?.code === '23505') {
          throw new ApiException(409, 'ALREADY_MEMBER', 'Ce compte fait déjà partie de cet espace de travail.');
        }
        throw err;
      });

    if (existing) {
      await this.db.update(sessions).set({ tenantId: inv.tenantId }).where(and(eq(sessions.id, session.id!), eq(sessions.userId, userId)));
    }
    const me = (await this.auth.meFor(userId, inv.tenantId))!;
    return { me, newAccount: !existing, role: inv.role as Role, workspace: tenantName };
  }
}
