"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RiLogoutBoxRLine, RiMailSendLine, RiMore2Fill, RiUserAddLine, RiUserUnfollowLine } from "@remixicon/react";
import type { ApiError, Invitation, Role, Team, TeamMember } from "@facture/core";
import { Card } from "@/components/app/layout";
import { NameAvatar } from "@/components/app/name-avatar";
import { Chip } from "@/components/base/badges/chip";
import { Button } from "@/components/base/buttons/button";
import { LinkButton } from "@/components/base/buttons/link-button";
import { Dropdown, DropdownGroup, DropdownItem, DropdownPopover, DropdownTrigger } from "@/components/base/dropdown/dropdown";
import { Input } from "@/components/base/input/input";
import { AlertDialog, Modal, ModalBody, ModalFooter, ModalHeader } from "@/components/base/modal/modal";
import { Radio, RadioGroup } from "@/components/base/radio/radio";
import { Select, SelectItem } from "@/components/base/select/select";
import { Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from "@/components/base/table/table";
import { toast } from "@/components/base/toast/toast";
import { Notice } from "@/components/auth/fields";
import { changeMemberRole, inviteMember, removeMember, resendInvitation, revokeInvitation } from "@/lib/actions";
import { leaveWorkspace } from "@/lib/auth-actions";
import { fmtDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n-client";
import { useMe } from "@/lib/me-client";
import { can, canManageMember, grantableRoles } from "@/lib/permissions";
import type { Key } from "@/lib/i18n";
import { cx } from "@/utils/cx";
import { RolesMatrix } from "./roles-matrix";

const roleColor = (r: Role) => (r === "OWNER" ? "purple" : r === "ADMIN" ? "blue" : r === "MEMBER" ? "lime" : "gray");
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Confirm =
  | { kind: "role"; member: TeamMember; to: Role }
  | { kind: "remove"; member: TeamMember }
  | { kind: "leave"; member: TeamMember }
  | { kind: "revoke"; invitation: Invitation };

function daysLeft(iso: string) {
  return Math.ceil((Date.parse(iso) - Date.now()) / 86_400_000);
}

export function TeamPanel({ team }: { team: Team }) {
  const { t } = useI18n();
  const router = useRouter();
  const me = useMe();
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [inviting, setInviting] = useState(false);
  if (!me) return null;
  const actor = me.role;
  const manager = can(actor, "team");
  const grantable = grantableRoles(actor);

  const message = (e: ApiError, ctx: { to?: Role; target?: Role } = {}) => {
    if (e.code === "LAST_OWNER" || e.code === "ALREADY_MEMBER" || e.code === "ALREADY_INVITED") return t(`team.err.${e.code}`);
    if (e.code === "FORBIDDEN" && actor === "ADMIN") {
      if (ctx.target === "OWNER") return t("team.err.ADMIN_OWNER");
      if (ctx.to === "OWNER") return t("team.err.OWNER_ONLY");
    }
    return e.code === "FORBIDDEN" ? e.message : t("team.err.generic");
  };

  const roleSelect = (m: TeamMember) => {
    const editable = manager && canManageMember(actor, m.role);
    if (!editable) return <Chip color={roleColor(m.role)} variant="caption">{t(`role.${m.role}`)}</Chip>;
    return (
      <Select
        size="sm"
        aria-label={t("team.roleFor", { name: m.name })}
        selectedKey={m.role}
        onSelectionChange={(k) => k && k !== m.role && setConfirm({ kind: "role", member: m, to: String(k) as Role })}
        className="w-full min-w-[170px] max-nav:[&_button]:min-h-11"
      >
        {grantable.map((r) => (
          <SelectItem key={r} id={r}>{t(`role.${r}`)}</SelectItem>
        ))}
      </Select>
    );
  };

  const menu = (m: TeamMember) => {
    const leave = m.isYou;
    const remove = !leave && manager && canManageMember(actor, m.role);
    if (!leave && !remove) return null;
    return (
      <Dropdown>
        <DropdownTrigger
          aria-label={t("team.menu", { name: m.name })}
          className={cx(
            "relative inline-flex size-8 shrink-0 items-center justify-center rounded-2lg max-nav:size-11",
            "border border-border-button-default bg-background-primary-default text-foreground-icon-primary shadow-xs",
            "transition-[background-color,border-color] duration-150 ease hover:border-border-button-hover hover:bg-background-primary-hover",
          )}
        >
          <RiMore2Fill className="size-4 shrink-0" aria-hidden />
        </DropdownTrigger>
        <DropdownPopover aria-label={t("team.menu", { name: m.name })} placement="bottom end" variant="compact" className="w-[240px]">
          <DropdownGroup>
            <DropdownItem onSelect={() => setConfirm({ kind: leave ? "leave" : "remove", member: m })}>
              <span className="flex items-center gap-2.5">
                {leave ? <RiLogoutBoxRLine className="size-[18px] shrink-0 text-foreground-icon-secondary rtl:-scale-x-100" aria-hidden /> : <RiUserUnfollowLine className="size-[18px] shrink-0 text-foreground-icon-secondary" aria-hidden />}
                {leave ? t("team.leave") : t("team.remove")}
              </span>
            </DropdownItem>
          </DropdownGroup>
        </DropdownPopover>
      </Dropdown>
    );
  };

  const identity = (m: TeamMember) => (
    <div className="flex min-w-0 items-center gap-3">
      <NameAvatar name={m.name} size="md" />
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <span dir="auto" className="truncate text-body-medium text-text-primary">{m.name}</span>
          {m.isYou && <Chip color="soft" variant="caption">{t("team.you")}</Chip>}
        </div>
        <div dir="ltr" className="truncate text-start text-caption-1-regular text-text-secondary rtl:text-end">{m.email}</div>
      </div>
    </div>
  );

  const mfa = (m: TeamMember) => (
    <Chip color={m.mfaEnabled ? "lime" : "gray"} variant="caption">{m.mfaEnabled ? t("team.mfaOn") : t("team.mfaOff")}</Chip>
  );

  const act = async () => {
    if (!confirm) return;
    const refresh = () => router.refresh();
    if (confirm.kind === "role") {
      const res = await changeMemberRole(confirm.member.userId, confirm.to);
      if (!res.ok) {
        toast.error(message(res.error, { to: confirm.to, target: confirm.member.role }));
        throw new Error(res.error.code);
      }
      toast.success(t("team.roleChanged", { name: confirm.member.name, role: t(`role.${confirm.to}`) }));
      return refresh();
    }
    if (confirm.kind === "remove") {
      const res = await removeMember(confirm.member.userId);
      if (!res.ok) {
        toast.error(message(res.error, { target: confirm.member.role }));
        throw new Error(res.error.code);
      }
      toast.success(t("team.removed", { name: confirm.member.name }));
      return refresh();
    }
    if (confirm.kind === "leave") {
      const res = await leaveWorkspace(confirm.member.userId);
      if (res && !res.ok) {
        toast.error(message(res.error));
        throw new Error(res.error.code);
      }
      return;
    }
    const res = await revokeInvitation(confirm.invitation.id);
    if (!res.ok) {
      toast.error(message(res.error));
      throw new Error(res.error.code);
    }
    toast.success(t("team.revoked"));
    refresh();
  };

  const resend = async (inv: Invitation) => {
    const res = await resendInvitation(inv.id);
    if (!res.ok) return void toast.error(message(res.error));
    toast.success(t("team.resent", { email: inv.email }));
    router.refresh();
  };

  const text = (() => {
    if (!confirm) return null;
    if (confirm.kind === "role")
      return {
        title: t("team.roleTitle", { name: confirm.member.name }),
        body: `${t("team.roleBody", { name: confirm.member.name, from: t(`role.${confirm.member.role}`), to: t(`role.${confirm.to}`) })} ${t(`role.desc.${confirm.to}`)}`,
        label: t("team.roleConfirm"),
        danger: false,
      };
    if (confirm.kind === "remove")
      return { title: t("team.removeTitle", { name: confirm.member.name }), body: t("team.removeBody", { name: confirm.member.name }), label: t("team.removeConfirm"), danger: true };
    if (confirm.kind === "leave")
      return { title: t("team.leaveTitle", { name: me.tenant.name }), body: t("team.leaveBody"), label: t("team.leaveConfirm"), danger: true };
    return { title: t("team.revokeTitle"), body: t("team.revokeBody", { email: confirm.invitation.email }), label: t("team.revoke"), danger: true };
  })();

  return (
    <div className="grid max-w-5xl gap-4">
      <Card className="p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-headline-medium text-text-primary">{t("team.title")}</h2>
            <p className="mt-0.5 text-body-regular text-text-secondary">{t(manager ? "team.intro" : "team.introReadOnly")}</p>
          </div>
          {manager && (
            <Button leadingIcon={RiUserAddLine} onClick={() => setInviting(true)} className="max-sm:w-full">{t("team.invite")}</Button>
          )}
        </div>

        <ul className="mt-5 grid divide-y divide-separator-border nav:hidden" aria-label={t("team.title")}>
          {team.members.map((m) => (
            <li key={m.userId} className="grid gap-3 py-4 first:pt-0">
              <div className="flex items-start justify-between gap-3">
                {identity(m)}
                {menu(m)}
              </div>
              <div className="grid gap-2">{roleSelect(m)}</div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-caption-1-regular text-text-secondary">
                {mfa(m)}
                <span className="num">{t("team.joined", { date: fmtDate(m.joinedAt.slice(0, 10)) })}</span>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-5 hidden min-w-0 overflow-x-auto nav:block">
          <Table aria-label={t("team.title")} selectionMode="none" className="min-w-[760px]">
            <TableHeader>
              <TableColumn id="member" isRowHeader>{t("team.col.member")}</TableColumn>
              <TableColumn id="role" className="w-[210px]">{t("team.col.role")}</TableColumn>
              <TableColumn id="mfa" className="w-[160px]">{t("team.col.mfa")}</TableColumn>
              <TableColumn id="joined" className="w-[120px]">{t("team.col.joined")}</TableColumn>
              <TableColumn id="actions" className="w-[56px]"><span className="sr-only">{t("common.actions")}</span></TableColumn>
            </TableHeader>
            <TableBody>
              {team.members.map((m) => (
                <TableRow key={m.userId} id={m.userId}>
                  <TableCell>{identity(m)}</TableCell>
                  <TableCell>{roleSelect(m)}</TableCell>
                  <TableCell>{mfa(m)}</TableCell>
                  <TableCell className="num whitespace-nowrap text-text-secondary">{fmtDate(m.joinedAt.slice(0, 10))}</TableCell>
                  <TableCell><div className="flex justify-end">{menu(m)}</div></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      {manager && (
        <Card className="p-4 sm:p-6">
          <h2 className="text-headline-medium text-text-primary">{t("team.pending")}</h2>
          <p className="mt-0.5 text-body-regular text-text-secondary">{t("team.pendingIntro")}</p>
          {team.invitations.length === 0 ? (
            <p className="mt-4 rounded-2xl bg-background-secondary-default px-4 py-3 text-body-regular text-text-secondary">{t("team.noPending")}</p>
          ) : (
            <ul className="mt-4 grid divide-y divide-separator-border">
              {team.invitations.map((inv) => {
                const d = daysLeft(inv.expiresAt);
                return (
                  <li key={inv.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 py-3.5 first:pt-0 last:pb-0">
                    <div className="min-w-0 flex-1 basis-[240px]">
                      <div dir="ltr" className="truncate text-start text-body-medium text-text-primary rtl:text-end">{inv.email}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption-1-regular text-text-secondary">
                        <Chip color={roleColor(inv.role)} variant="caption">{t(`role.${inv.role}`)}</Chip>
                        {inv.invitedByName && <span>{t("team.invitedBy", { name: inv.invitedByName })}</span>}
                        <span className={cx("num", d <= 0 && "text-text-error-primary")}>
                          {d <= 0 ? t("team.expired") : t("team.expiresIn", { n: d })}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 max-sm:w-full max-sm:[&>*]:flex-1">
                      <Button size="small" variant="secondary" leadingIcon={RiMailSendLine} onClick={() => void resend(inv)}>{t("team.resend")}</Button>
                      <Button size="small" variant="secondary" onClick={() => setConfirm({ kind: "revoke", invitation: inv })}>{t("team.revoke")}</Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}

      <Card className="p-4 sm:p-6">
        <h2 className="text-headline-medium text-text-primary">{t("team.rolesTitle")}</h2>
        <p className="mt-0.5 mb-3 text-body-regular text-text-secondary">{t("team.rolesIntro")}</p>
        <RolesMatrix />
      </Card>

      {text && confirm && (
        <AlertDialog
          isOpen
          onOpenChange={(o) => !o && setConfirm(null)}
          variant={text.danger ? "danger" : "default"}
          icon={text.danger ? undefined : false}
          title={text.title}
          description={text.body}
          confirmLabel={text.label}
          cancelLabel={t("common.cancel")}
          pendingLabel={t("auth.pending")}
          onConfirm={act}
        />
      )}

      {inviting && (
        <InviteDialog
          team={team}
          roles={grantable}
          onClose={() => setInviting(false)}
          onResend={resend}
        />
      )}
    </div>
  );
}

function InviteDialog({ team, roles, onClose, onResend }: { team: Team; roles: readonly Role[]; onClose: () => void; onResend: (inv: Invitation) => Promise<void> }) {
  const { t } = useI18n();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>(roles.includes("MEMBER") ? "MEMBER" : roles[0]!);
  const [error, setError] = useState<ApiError | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const existing = error?.code === "ALREADY_INVITED" ? team.invitations.find((i) => i.email.toLowerCase() === email.trim().toLowerCase()) : undefined;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    const value = email.trim();
    setError(null);
    if (!EMAIL.test(value)) return setEmailError(t("team.err.email"));
    setEmailError(null);
    setPending(true);
    const res = await inviteMember({ email: value, role });
    setPending(false);
    if (!res.ok) {
      const issue = res.error.issues?.find((i) => i.path === "email");
      if (issue) setEmailError(issue.message);
      else setError(res.error);
      return;
    }
    toast.success(t("team.invited", { email: value }));
    router.refresh();
    onClose();
  };

  const errorText = error && (["ALREADY_MEMBER", "ALREADY_INVITED"].includes(error.code) ? t(`team.err.${error.code}` as Key) : error.code === "FORBIDDEN" ? error.message : t("team.err.generic"));

  return (
    <Modal isOpen onOpenChange={(o) => !o && !pending && onClose()} size="md" aria-label={t("team.inviteTitle")}>
      <ModalHeader title={t("team.inviteTitle")} description={t("team.inviteIntro")} closeLabel={t("common.close")} />
      <ModalBody>
        <form id="invite-form" onSubmit={submit} noValidate className="grid gap-4">
          {errorText && (
            <div className="grid justify-items-start gap-2">
              <Notice tone="error">{errorText}</Notice>
              {existing && (
                <LinkButton
                  onClick={async () => {
                    await onResend(existing);
                    onClose();
                  }}
                >
                  {t("team.err.resendInstead")}
                </LinkButton>
              )}
            </div>
          )}
          <Input
            label={t("team.inviteEmail")}
            type="email"
            value={email}
            onChange={(v) => {
              setEmail(v);
              setEmailError(null);
            }}
            inputDir="ltr"
            autoComplete="off"
            isRequired
            autoFocus
            isInvalid={!!emailError}
            errorMessage={emailError}
          />
          <RadioGroup aria-label={t("team.inviteRole")} value={role} onChange={(v) => setRole(v as Role)} className="gap-2">
            <span className="text-body-medium text-text-primary">{t("team.inviteRole")}</span>
            {roles.map((r) => (
              <Radio
                key={r}
                value={r}
                className="w-full items-start rounded-xl border border-border-button-default bg-background-primary-default p-3 transition-colors hover:bg-background-primary-hover data-[selected]:border-border-button-active data-[selected]:bg-background-secondary-default data-[focus-visible]:ring-2 data-[focus-visible]:ring-border-focus-ring"
              >
                <span className="grid gap-0.5">
                  <span className="text-body-medium text-text-primary">{t(`role.${r}`)}</span>
                  <span className="text-caption-1-regular text-text-secondary">{t(`role.desc.${r}`)}</span>
                </span>
              </Radio>
            ))}
          </RadioGroup>
        </form>
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={onClose} disabled={pending}>{t("common.cancel")}</Button>
        <Button type="submit" form="invite-form" leadingIcon={RiMailSendLine} disabled={pending} aria-busy={pending}>{t("team.inviteSend")}</Button>
      </ModalFooter>
    </Modal>
  );
}
