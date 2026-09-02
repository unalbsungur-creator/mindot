"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { PageContainer } from "@/components/layout/PageContainer";
import { cn } from "@/lib/cn";
import { useLocale } from "@/i18n/LocaleProvider";
import type { Dictionary } from "@/i18n/translations";
import { createInvitation, revokeInvitation } from "@/features/invitations/actions";
import {
  getEffectiveStatus,
  type Invitation,
  type InvitationEmailStatus,
  type InvitationStatus,
} from "@/features/invitations/types";

interface InvitationsPageContentProps {
  authorized: boolean;
  invitations: Invitation[];
}

export function InvitationsPageContent({ authorized, invitations: initial }: InvitationsPageContentProps) {
  const { dictionary } = useLocale();
  const [invitations, setInvitations] = useState(initial);

  if (!authorized) {
    return (
      <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center py-16">
        <PageContainer className="mx-auto flex max-w-md flex-col items-center gap-3 text-center">
          <h1 className="font-display text-2xl font-medium text-navy">
            {dictionary.moderation.unauthorizedTitle}
          </h1>
          <p className="text-ink-soft">{dictionary.moderation.unauthorizedBody}</p>
        </PageContainer>
      </div>
    );
  }

  return (
    <PageContainer className="flex flex-col gap-10 py-16">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-medium text-navy sm:text-4xl">
          {dictionary.invitationsAdmin.title}
        </h1>
        <p className="text-ink-soft">{dictionary.invitationsAdmin.subtitle}</p>
      </div>

      <CreateInvitationForm onCreated={(invitation) => setInvitations((current) => [invitation, ...current])} />

      <div className="flex flex-col gap-4">
        <h2 className="font-display text-xl font-medium text-navy">{dictionary.invitationsAdmin.listHeading}</h2>
        {invitations.length === 0 ? (
          <p className="text-sm text-ink-soft">{dictionary.invitationsAdmin.noInvitationsYet}</p>
        ) : (
          <div className="flex flex-col gap-3">
            {invitations.map((invitation) => (
              <InvitationRow
                key={invitation.id}
                invitation={invitation}
                onRevoked={(updated) =>
                  setInvitations((current) => current.map((item) => (item.id === updated.id ? updated : item)))
                }
              />
            ))}
          </div>
        )}
      </div>
    </PageContainer>
  );
}

function CreateInvitationForm({ onCreated }: { onCreated: (invitation: Invitation) => void }) {
  const { dictionary } = useLocale();
  const [email, setEmail] = useState("");
  const [maxUses, setMaxUses] = useState(1);
  const [expiresInDays, setExpiresInDays] = useState<number | null>(30);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState(false);
  // EPIC: E-mail Gönderimi İçin Güvenli Mimari — a distinct, one-time
  // notice (not the row's own persistent badge, see InvitationRow) so an
  // admin who just asked for an email immediately understands why none
  // will arrive, right where they took the action.
  const [emailNotConfiguredNotice, setEmailNotConfiguredNotice] = useState(false);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(false);
    setEmailNotConfiguredNotice(false);
    startTransition(async () => {
      const result = await createInvitation({ recipientEmail: email, maxUses, expiresInDays });
      if (!result.ok || !result.invitation) {
        setError(true);
        return;
      }
      onCreated(result.invitation);
      if (result.invitation.emailStatus === "not_configured") setEmailNotConfiguredNotice(true);
      setEmail("");
      setMaxUses(1);
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5"
    >
      <h2 className="font-display text-lg font-medium text-navy">{dictionary.invitationsAdmin.createHeading}</h2>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-2 sm:col-span-1">
          <label htmlFor="invitation-email" className="text-sm font-medium text-navy">
            {dictionary.invitationsAdmin.emailLabel}
          </label>
          <input
            id="invitation-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder={dictionary.invitationsAdmin.emailPlaceholder}
            className="w-full rounded-md border border-border bg-surface p-2.5 text-sm text-ink shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="invitation-max-uses" className="text-sm font-medium text-navy">
            {dictionary.invitationsAdmin.maxUsesLabel}
          </label>
          <input
            id="invitation-max-uses"
            type="number"
            min={1}
            value={maxUses}
            onChange={(event) => setMaxUses(Math.max(1, Number(event.target.value) || 1))}
            className="w-full rounded-md border border-border bg-surface p-2.5 text-sm text-ink shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="invitation-expiry" className="text-sm font-medium text-navy">
            {dictionary.invitationsAdmin.expiryLabel}
          </label>
          <select
            id="invitation-expiry"
            value={expiresInDays === null ? "none" : String(expiresInDays)}
            onChange={(event) => setExpiresInDays(event.target.value === "none" ? null : Number(event.target.value))}
            className="w-full rounded-md border border-border bg-surface p-2.5 text-sm text-ink shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange"
          >
            <option value="7">{dictionary.invitationsAdmin.expiry7Days}</option>
            <option value="30">{dictionary.invitationsAdmin.expiry30Days}</option>
            <option value="none">{dictionary.invitationsAdmin.expiryNone}</option>
          </select>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{dictionary.invitationsAdmin.createError}</p>}
      {emailNotConfiguredNotice && (
        <p className="rounded-md border border-orange/30 bg-orange-tint/50 p-2.5 text-sm text-orange-ink">
          {dictionary.invitationsAdmin.emailNotConfiguredNotice}
        </p>
      )}

      <div>
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? dictionary.invitationsAdmin.creating : dictionary.invitationsAdmin.createButton}
        </Button>
      </div>
    </form>
  );
}

const statusBadgeClasses: Record<InvitationStatus, string> = {
  active: "border-navy/20 bg-navy/5 text-navy",
  used: "border-border bg-canvas text-ink-soft",
  expired: "border-border bg-canvas text-ink-soft",
  revoked: "border-red-200 bg-red-50 text-red-700",
};

function statusLabel(dictionary: Dictionary, status: InvitationStatus): string {
  return {
    active: dictionary.invitationsAdmin.statusActive,
    used: dictionary.invitationsAdmin.statusUsed,
    expired: dictionary.invitationsAdmin.statusExpired,
    revoked: dictionary.invitationsAdmin.statusRevoked,
  }[status];
}

/**
 * EPIC: Davetler Ekranında E-mail Durumu — a plain glyph + label rather
 * than a Badge: this is secondary metadata next to the recipient line,
 * not another status pill competing with the invitation's own status
 * badge above it. Never affects the link's own usability either way.
 */
function emailStatusDisplay(dictionary: Dictionary, status: InvitationEmailStatus): { glyph: string; label: string; className: string } {
  switch (status) {
    case "sent":
      return { glyph: "✓", label: dictionary.invitationsAdmin.emailStatusSent, className: "text-navy" };
    case "failed":
      return { glyph: "⚠", label: dictionary.invitationsAdmin.emailStatusFailed, className: "text-red-600" };
    case "not_configured":
      return { glyph: "⚠", label: dictionary.invitationsAdmin.emailStatusNotConfigured, className: "text-orange-ink" };
    case "not_requested":
    default:
      return { glyph: "—", label: dictionary.invitationsAdmin.emailStatusNotRequested, className: "text-ink-soft" };
  }
}

function InvitationRow({
  invitation,
  onRevoked,
}: {
  invitation: Invitation;
  onRevoked: (invitation: Invitation) => void;
}) {
  const { dictionary } = useLocale();
  const [isPending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const status = getEffectiveStatus(invitation);
  const link = typeof window !== "undefined" ? `${window.location.origin}/invite/${invitation.token}` : `/invite/${invitation.token}`;

  function handleCopy() {
    navigator.clipboard
      .writeText(link)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {
        // Clipboard access can fail (permissions, insecure context); the
        // link is still visible and selectable in the input below.
      });
  }

  function handleRevoke() {
    startTransition(async () => {
      const result = await revokeInvitation(invitation.id);
      if (result.ok && result.invitation) onRevoked(result.invitation);
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge className={cn("normal-case", statusBadgeClasses[status])}>{statusLabel(dictionary, status)}</Badge>
        <span className="text-xs text-ink-soft">
          {dictionary.invitationsAdmin.usageLabel
            .replace("{used}", String(invitation.usedCount))
            .replace("{max}", String(invitation.maxUses))}
        </span>
        <span className="text-xs text-ink-soft">
          {dictionary.invitationsAdmin.recipientLabel}:{" "}
          {invitation.recipientEmail ?? dictionary.invitationsAdmin.noRecipient}
        </span>
        {(() => {
          const emailStatus = emailStatusDisplay(dictionary, invitation.emailStatus);
          return (
            <span className={cn("text-xs", emailStatus.className)}>
              {dictionary.invitationsAdmin.emailStatusLabel}: {emailStatus.glyph} {emailStatus.label}
            </span>
          );
        })()}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`link-${invitation.id}`} className="sr-only">
          {dictionary.invitationsAdmin.linkLabel}
        </label>
        <input
          id={`link-${invitation.id}`}
          type="text"
          readOnly
          value={link}
          onFocus={(event) => event.currentTarget.select()}
          className="min-w-0 flex-1 rounded-md border border-border bg-canvas px-2.5 py-1.5 text-xs text-ink-soft"
        />
        <Button type="button" size="sm" variant="ghost" onClick={handleCopy}>
          {copied ? dictionary.invitationsAdmin.copied : dictionary.invitationsAdmin.copyButton}
        </Button>
        {status === "active" && (
          <Button type="button" size="sm" variant="ghost" onClick={handleRevoke} disabled={isPending}>
            {isPending ? dictionary.invitationsAdmin.revoking : dictionary.invitationsAdmin.revokeButton}
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-4 text-xs text-ink-soft">
        <span>
          {dictionary.invitationsAdmin.createdLabel}: {new Date(invitation.createdAt).toLocaleDateString()}
        </span>
        <span>
          {dictionary.invitationsAdmin.expiresLabel}:{" "}
          {invitation.expiresAt
            ? new Date(invitation.expiresAt).toLocaleDateString()
            : dictionary.invitationsAdmin.neverExpires}
        </span>
      </div>
    </div>
  );
}
