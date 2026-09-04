"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Note } from "@/features/notes/components/Note";
import { getNoteTemplate } from "@/features/notes/config/templates";
import type { NoteData } from "@/features/notes/types";
import { cn } from "@/lib/cn";
import { useLocale } from "@/i18n/LocaleProvider";
import type { Dictionary } from "@/i18n/translations";
import {
  approveMessage,
  archiveMessage,
  reconsiderMessage,
  rejectMessage,
  restoreMessage,
} from "../moderation-actions";
import type { AiModerationDecision, Message, MessageStatus } from "../types";

interface ModerationQueueProps {
  pending: Message[];
  approved: Message[];
  archived: Message[];
  rejected: Message[];
  /** EPIC 014: moderatedBy user id -> display name, resolved server-side (never trust a client-supplied moderator identity). */
  moderatorNameById: Record<string, string>;
}

/**
 * EPIC: Yönetim Panelinde Statü Grupları — four independent categories,
 * always shown top to bottom in this order (İncelemede → Yayında →
 * Arşivlendi → Reddedildi), each a horizontally-scrolling row of cards
 * rather than a vertical stack (see CategoryRow below) — a message moves
 * between these lists as its status actually changes server-side, never
 * just hidden/relabeled client-side. Every category renders even when
 * empty, with its own short empty-state line, so an admin can see the
 * whole system's state on one screen.
 */
export function ModerationQueue({
  pending: initialPending,
  approved: initialApproved,
  archived: initialArchived,
  rejected: initialRejected,
  moderatorNameById,
}: ModerationQueueProps) {
  const { dictionary } = useLocale();
  const [pending, setPending] = useState(initialPending);
  const [approved, setApproved] = useState(initialApproved);
  const [archived, setArchived] = useState(initialArchived);
  const [rejected, setRejected] = useState(initialRejected);
  // EPIC 014: server-resolved names, extended locally whenever a fresh
  // moderation action reports back the acting admin's own name — so a
  // moderator's very first action this session still shows their name
  // immediately, without waiting for a full page reload to re-resolve the
  // server-side moderatorNameById map.
  const [moderatorNames, setModeratorNames] = useState(moderatorNameById);

  function rememberModerator(id: string | null, name: string | undefined) {
    if (!id || !name) return;
    setModeratorNames((current) => (current[id] ? current : { ...current, [id]: name }));
  }

  function handleApproved(message: Message, moderatorName?: string) {
    rememberModerator(message.moderatedBy, moderatorName);
    setPending((current) => current.filter((item) => item.id !== message.id));
    setApproved((current) => [message, ...current]);
  }

  function handleRejected(message: Message, moderatorName?: string) {
    rememberModerator(message.moderatedBy, moderatorName);
    setPending((current) => current.filter((item) => item.id !== message.id));
    setRejected((current) => [message, ...current]);
  }

  function handleArchived(message: Message, moderatorName?: string) {
    rememberModerator(message.moderatedBy, moderatorName);
    setApproved((current) => current.filter((item) => item.id !== message.id));
    setArchived((current) => [message, ...current]);
  }

  function handleRestored(message: Message, moderatorName?: string) {
    rememberModerator(message.moderatedBy, moderatorName);
    setArchived((current) => current.filter((item) => item.id !== message.id));
    setApproved((current) => [message, ...current]);
  }

  function handleReconsidered(message: Message, moderatorName?: string) {
    rememberModerator(message.moderatedBy, moderatorName);
    setRejected((current) => current.filter((item) => item.id !== message.id));
    setPending((current) => [message, ...current]);
  }

  return (
    <div className="flex flex-col gap-10">
      <CategoryRow heading={dictionary.moderation.pendingHeading} messages={pending} emptyText={dictionary.moderation.emptyPending}>
        {(message) => (
          <QueueCard
            key={message.id}
            message={message}
            moderatorNames={moderatorNames}
            onApproved={handleApproved}
            onRejected={handleRejected}
          />
        )}
      </CategoryRow>

      <CategoryRow heading={dictionary.moderation.approvedHeading} messages={approved} emptyText={dictionary.moderation.emptyApproved}>
        {(message) => (
          <QueueCard key={message.id} message={message} moderatorNames={moderatorNames} onArchived={handleArchived} />
        )}
      </CategoryRow>

      <CategoryRow heading={dictionary.moderation.archivedHeading} messages={archived} emptyText={dictionary.moderation.emptyArchived}>
        {(message) => (
          <QueueCard key={message.id} message={message} moderatorNames={moderatorNames} onRestored={handleRestored} />
        )}
      </CategoryRow>

      <CategoryRow heading={dictionary.moderation.rejectedHeading} messages={rejected} emptyText={dictionary.moderation.emptyRejected}>
        {(message) => (
          <QueueCard key={message.id} message={message} moderatorNames={moderatorNames} onReconsidered={handleReconsidered} />
        )}
      </CategoryRow>
    </div>
  );
}

/**
 * One category section: heading + count, then either an empty-state line
 * or a horizontally-scrolling row of fixed-width cards. Deliberately
 * `overflow-x-auto` rather than wrapping to new rows — "yatay ilerlesin,
 * dikey uzun listeye dönmesin" is the one hard rule this EPIC set, and a
 * scrolling row guarantees that at any viewport width without a wrapping
 * calculation that could quietly degrade back into a tall column on a
 * narrow screen.
 */
function CategoryRow({
  heading,
  messages,
  emptyText,
  children,
}: {
  heading: string;
  messages: Message[];
  emptyText: string;
  children: (message: Message) => ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-display text-xl font-medium text-navy">
        {heading}
        <span className="ml-2 text-sm font-normal text-ink-soft">({messages.length})</span>
      </h2>
      {messages.length === 0 ? (
        <p className="text-sm text-ink-soft">{emptyText}</p>
      ) : (
        <div className="-mx-1 flex gap-4 overflow-x-auto px-1 pb-2">
          {messages.map((message) => (
            <div key={message.id} className="w-72 shrink-0 sm:w-80">
              {children(message)}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

const statusBadgeClasses: Record<MessageStatus, string> = {
  pending: "border-orange/30 bg-orange-tint/60 text-orange-ink",
  approved: "border-navy/20 bg-navy/5 text-navy",
  rejected: "border-border bg-canvas text-ink-soft",
  // Visually distinct from every active status — a message that once
  // looked like this same card but was pulled off the board on purpose.
  archived: "border-border bg-ink/5 text-ink-soft",
};

const aiBadgeClasses: Record<AiModerationDecision, string> = {
  safe: "border-navy/20 bg-navy/5 text-navy",
  review: "border-orange/30 bg-orange-tint/60 text-orange-ink",
  blocked: "border-red-200 bg-red-50 text-red-700",
};

function aiLabel(dictionary: Dictionary, decision: AiModerationDecision): string {
  return {
    safe: dictionary.moderation.aiDecisionSafe,
    review: dictionary.moderation.aiDecisionReview,
    blocked: dictionary.moderation.aiDecisionBlocked,
  }[decision];
}

function QueueCard({
  message,
  moderatorNames,
  onApproved,
  onRejected,
  onArchived,
  onRestored,
  onReconsidered,
}: {
  message: Message;
  moderatorNames: Record<string, string>;
  onApproved?: (message: Message, moderatorName?: string) => void;
  onRejected?: (message: Message, moderatorName?: string) => void;
  onArchived?: (message: Message, moderatorName?: string) => void;
  onRestored?: (message: Message, moderatorName?: string) => void;
  onReconsidered?: (message: Message, moderatorName?: string) => void;
}) {
  const { dictionary } = useLocale();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState(false);
  const [confirmingArchive, setConfirmingArchive] = useState(false);
  const [confirmingReject, setConfirmingReject] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [archiveReason, setArchiveReason] = useState("");

  const template = getNoteTemplate(message.templateId);
  const previewNote: NoteData = {
    id: message.id,
    content: message.content,
    authorName: message.authorName,
    templateId: message.templateId,
    size: "sm",
    rotation: 0,
    position: { top: "0%", left: "0%" },
    language: message.language,
  };

  const statusLabel: Record<MessageStatus, string> = {
    pending: dictionary.moderation.statusPending,
    approved: dictionary.moderation.statusApproved,
    rejected: dictionary.moderation.statusRejected,
    archived: dictionary.moderation.statusArchived,
  };

  function handleApprove() {
    setError(false);
    startTransition(async () => {
      const result = await approveMessage(message.id);
      if (!result.ok || !result.message) {
        setError(true);
        return;
      }
      onApproved?.(result.message, result.moderatorName);
    });
  }

  function handleConfirmReject() {
    setError(false);
    startTransition(async () => {
      const result = await rejectMessage(message.id, rejectReason);
      setConfirmingReject(false);
      if (!result.ok || !result.message) {
        setError(true);
        return;
      }
      setRejectReason("");
      onRejected?.(result.message, result.moderatorName);
    });
  }

  function handleConfirmArchive() {
    setError(false);
    startTransition(async () => {
      const result = await archiveMessage(message.id, archiveReason);
      setConfirmingArchive(false);
      if (!result.ok || !result.message) {
        setError(true);
        return;
      }
      setArchiveReason("");
      onArchived?.(result.message, result.moderatorName);
    });
  }

  function handleRestore() {
    setError(false);
    startTransition(async () => {
      const result = await restoreMessage(message.id);
      if (!result.ok || !result.message) {
        setError(true);
        return;
      }
      onRestored?.(result.message, result.moderatorName);
    });
  }

  function handleReconsider() {
    setError(false);
    startTransition(async () => {
      const result = await reconsiderMessage(message.id);
      if (!result.ok || !result.message) {
        setError(true);
        return;
      }
      onReconsidered?.(result.message, result.moderatorName);
    });
  }

  return (
    <div className="flex h-full flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <div className="flex justify-center">
        <Note note={previewNote} variant="static" />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge className={cn("normal-case", statusBadgeClasses[message.status])}>{statusLabel[message.status]}</Badge>
        <Badge className="normal-case border-border bg-canvas text-ink-soft">
          {message.isAnonymous ? dictionary.moderation.anonymousBadge : dictionary.moderation.namedBadge}
        </Badge>
      </div>
      <p className="text-xs text-ink-soft">
        {dictionary.moderation.templateLabel}: {template.name}
      </p>
      <p className="text-xs text-ink-soft">
        {dictionary.moderation.submittedLabel} {new Date(message.createdAt).toLocaleString()}
      </p>
      <p className="text-xs text-ink-soft">
        {dictionary.moderation.invitationLabel}: {message.invitationId ?? dictionary.moderation.noInvitation}
      </p>

      {message.moderatedAt && (
        // EPIC 014: only rendered once a decision actually exists (a
        // still-pending message has no moderatedAt yet) — moderator name
        // is resolved server-side (moderatorNames), never taken from
        // anything client-supplied.
        <div className="flex flex-col gap-0.5 rounded-md border border-border/70 bg-canvas/60 p-2.5 text-xs text-ink-soft">
          <span>
            {dictionary.moderation.moderatorLabel}: {moderatorNames[message.moderatedBy ?? ""] ?? message.moderatedBy}
          </span>
          <span>
            {dictionary.moderation.moderatedAtLabel}: {new Date(message.moderatedAt).toLocaleString()}
          </span>
          <span className="line-clamp-3 break-words">
            {dictionary.moderation.moderationReasonLabel}: {message.moderationReason || dictionary.moderation.noModerationReason}
          </span>
        </div>
      )}

      <div className="flex flex-col gap-1 rounded-md border border-border/70 bg-canvas/60 p-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-ink-soft">
            {dictionary.moderation.aiSectionLabel}
          </span>
          {message.aiModerationStatus ? (
            <Badge className={cn("normal-case", aiBadgeClasses[message.aiModerationStatus])}>
              {aiLabel(dictionary, message.aiModerationStatus)}
            </Badge>
          ) : (
            <span className="text-xs text-ink-soft">—</span>
          )}
        </div>
        {message.aiModerationStatus && (
          <div className="flex flex-col gap-0.5 text-xs text-ink-soft">
            <span>
              {dictionary.moderation.aiProviderLabel}: {message.aiModerationProvider}
            </span>
            <span>
              {dictionary.moderation.aiCategoriesLabel}:{" "}
              {message.aiModerationCategories.length > 0
                ? message.aiModerationCategories.join(", ")
                : dictionary.moderation.aiNoCategories}
            </span>
            {message.aiModerationReason && (
              <span>
                {dictionary.moderation.aiReasonLabel}: {message.aiModerationReason}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
        {message.status === "pending" && (
          <>
            <Button size="sm" onClick={handleApprove} disabled={isPending}>
              {isPending ? dictionary.moderation.approving : dictionary.moderation.approve}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmingReject(true)} disabled={isPending}>
              {isPending ? dictionary.moderation.rejecting : dictionary.moderation.reject}
            </Button>
            <ConfirmDialog
              open={confirmingReject}
              title={dictionary.moderation.rejectConfirmTitle}
              body={dictionary.moderation.rejectConfirmBody}
              cancelLabel={dictionary.moderation.rejectConfirmCancel}
              confirmLabel={dictionary.moderation.rejectConfirmConfirm}
              reasonLabel={dictionary.moderation.moderationReasonLabel}
              reasonPlaceholder={dictionary.moderation.moderationReasonPlaceholder}
              reasonValue={rejectReason}
              onReasonChange={setRejectReason}
              onConfirm={handleConfirmReject}
              onCancel={() => setConfirmingReject(false)}
              confirmDisabled={isPending}
            />
          </>
        )}

        {message.status === "approved" && onArchived && (
          <>
            <Button size="sm" variant="ghost" onClick={() => setConfirmingArchive(true)} disabled={isPending}>
              {isPending ? dictionary.moderation.archiving : dictionary.moderation.archiveAction}
            </Button>
            <ConfirmDialog
              open={confirmingArchive}
              title={dictionary.moderation.archiveConfirmTitle}
              body={dictionary.moderation.archiveConfirmBody}
              cancelLabel={dictionary.moderation.archiveConfirmCancel}
              confirmLabel={dictionary.moderation.archiveConfirmConfirm}
              reasonLabel={dictionary.moderation.moderationReasonLabel}
              reasonPlaceholder={dictionary.moderation.moderationReasonPlaceholder}
              reasonValue={archiveReason}
              onReasonChange={setArchiveReason}
              onConfirm={handleConfirmArchive}
              onCancel={() => setConfirmingArchive(false)}
              confirmDisabled={isPending}
            />
          </>
        )}

        {message.status === "archived" && onRestored && (
          <Button size="sm" onClick={handleRestore} disabled={isPending}>
            {isPending ? dictionary.moderation.restoring : dictionary.moderation.restoreAction}
          </Button>
        )}

        {message.status === "rejected" && onReconsidered && (
          <Button size="sm" variant="ghost" onClick={handleReconsider} disabled={isPending}>
            {isPending ? dictionary.moderation.reconsidering : dictionary.moderation.reconsiderAction}
          </Button>
        )}

        {error && <span className="text-xs text-red-600">{dictionary.moderation.errorGeneric}</span>}
      </div>
    </div>
  );
}
