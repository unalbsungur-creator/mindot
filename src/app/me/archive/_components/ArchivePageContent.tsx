"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { PageContainer } from "@/components/layout/PageContainer";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { getNoteTemplate } from "@/features/notes/config/templates";
import { Note } from "@/features/notes/components/Note";
import { templateDisplayName } from "@/features/notes/lib/templateDisplayName";
import { MESSAGE_MAX_LENGTH } from "@/features/messages/types";
import { setMessageWallVisibility, submitMessageRevision } from "@/features/profile/actions";
import { ArchiveSearchFilter } from "@/features/profile/components/ArchiveSearchFilter";
import { TimeRangeFilter } from "@/features/profile/components/TimeRangeFilter";
import type { ArchiveMessage } from "@/features/profile/types";
import { useLocale } from "@/i18n/LocaleProvider";
import type { Dictionary } from "@/i18n/translations";
import { cn } from "@/lib/cn";

interface ArchivePageContentProps {
  isSignedIn: boolean;
  messages: ArchiveMessage[];
  page: number;
  totalPages: number;
}

/**
 * EPIC 024: preserves every existing query param (in practice, just
 * `from`/`to`) while only touching `page` — so Prev/Next never disturbs
 * the active date filter. `page` 1 drops the param entirely rather than
 * writing `?page=1`, keeping the default URL clean.
 */
function pageHref(pathname: string, searchParams: URLSearchParams, page: number): string {
  const next = new URLSearchParams(searchParams);
  if (page <= 1) next.delete("page");
  else next.set("page", String(page));
  const qs = next.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

function stateLabel(dictionary: Dictionary, state: ArchiveMessage["state"]): string {
  return {
    pending: dictionary.archive.statePending,
    published: dictionary.archive.statePublished,
    not_published: dictionary.archive.stateNotPublished,
  }[state];
}

/** The board camera URL for a message's own world point — not its tile's center — so "view on board" opens directly on the actual note. */
function boardLinkFor(point: { x: number; y: number }): string {
  return `/board?x=${Math.round(point.x)}&y=${Math.round(point.y)}&z=1`;
}

export function ArchivePageContent({ isSignedIn, messages: initialMessages, page, totalPages }: ArchivePageContentProps) {
  const { dictionary } = useLocale();
  const searchParams = useSearchParams();
  const hasDateFilter = searchParams.has("from") || searchParams.has("to");
  const hasSearch = (searchParams.get("q") ?? "").trim().length > 0;
  const hasFilter = hasDateFilter || hasSearch;
  const [messages, setMessages] = useState(initialMessages);
  // `messages` is local state (not read straight from the prop) so
  // WallVisibilityToggle/EditMessageAction can apply an optimistic update
  // without a full re-fetch — but that means it also needs to be
  // re-synced whenever the *server* sends a genuinely new result set (a
  // search, date-filter, or page change all reach this component as a new
  // `initialMessages` prop via a client-side navigation, not a fresh
  // mount). Adjusted during render (not in an effect) per the React docs'
  // "adjusting state when a prop changes" pattern, avoiding an extra
  // render pass.
  const [prevInitialMessages, setPrevInitialMessages] = useState(initialMessages);
  if (initialMessages !== prevInitialMessages) {
    setPrevInitialMessages(initialMessages);
    setMessages(initialMessages);
  }

  if (!isSignedIn) {
    return (
      <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center py-16">
        <PageContainer className="mx-auto flex max-w-md flex-col items-center gap-6 text-center">
          <h1 className="font-display text-2xl font-medium text-navy">{dictionary.archive.pageTitle}</h1>
          <GoogleSignInButton redirectTo="/me/archive" />
        </PageContainer>
      </div>
    );
  }

  return (
    <PageContainer className="mx-auto flex max-w-2xl flex-col gap-8 py-16">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="font-display text-2xl font-medium text-navy">{dictionary.archive.pageTitle}</h1>
        <p className="text-sm text-ink-soft">{dictionary.archive.subtitle}</p>
      </div>

      <TimeRangeFilter />
      <ArchiveSearchFilter />

      {messages.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="text-sm text-ink-soft">
            {hasSearch
              ? dictionary.archive.emptyMessageSearch
              : hasDateFilter
                ? dictionary.archive.emptyMessage
                : dictionary.archive.emptyMessageAllTime}
          </p>
          {hasFilter ? (
            <Link href="/me/archive" className="text-sm font-medium text-ink-soft hover:text-navy">
              {dictionary.archive.allTime}
            </Link>
          ) : (
            <Link href="/write" className="text-sm font-medium text-ink-soft hover:text-navy">
              {dictionary.nav.writeThought}
            </Link>
          )}
        </div>
      ) : (
        <ul className="flex flex-col gap-4">
          {messages.map((message) => {
            const template = getNoteTemplate(message.templateId);
            const eligibleForWall = message.state === "published" && !message.isAnonymous;
            const hasPendingRevision = message.pendingContent !== null;
            const editEligible = message.state === "published" && !hasPendingRevision;
            return (
              <li key={message.id} className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 sm:flex-row sm:items-center">
                <div className="flex justify-center sm:shrink-0">
                  <Note
                    variant="static"
                    note={{
                      id: message.id,
                      content: message.content,
                      authorName: "",
                      authorImage: null,
                      templateId: message.templateId,
                      fontFamily: message.fontFamily,
                      size: "sm",
                      rotation: 0,
                      position: { top: "0%", left: "0%" },
                      language: message.language,
                    }}
                  />
                </div>
                <div className="flex flex-1 flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      className={cn(
                        "normal-case",
                        message.state === "published" && "border-navy/20 bg-navy/5 text-navy",
                        message.state === "pending" && "border-orange/30 bg-orange-tint/60 text-orange-ink",
                        message.state === "not_published" && "border-border bg-canvas text-ink-soft"
                      )}
                    >
                      {stateLabel(dictionary, message.state)}
                    </Badge>
                    <Badge className="border-border bg-canvas normal-case text-ink-soft">
                      {message.isAnonymous ? dictionary.moderation.anonymousBadge : dictionary.moderation.namedBadge}
                    </Badge>
                    {hasPendingRevision && (
                      <Badge className="border-orange/30 bg-orange-tint/60 normal-case text-orange-ink">
                        {dictionary.archive.editPendingBadge}
                      </Badge>
                    )}
                    <span className="text-xs text-ink-soft">{templateDisplayName(template, dictionary)}</span>
                  </div>
                  <span className="text-xs text-ink-soft">{new Date(message.createdAt).toLocaleDateString()}</span>
                  {!hasPendingRevision && message.revisionRejectionReason && (
                    <p className="text-xs text-ink-soft">{dictionary.archive.editRejectedNotice}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-3 text-xs font-medium">
                    {message.boardPoint && (
                      <Link href={boardLinkFor(message.boardPoint)} className="text-ink-soft hover:text-navy">
                        {dictionary.archive.viewOnBoardAction}
                      </Link>
                    )}
                    {message.state === "published" && (
                      <>
                        {message.memoryProjectId ? (
                          <Link href={`/memory/${message.id}`} className="text-ink-soft hover:text-navy">
                            {dictionary.archive.viewMemoryAction}
                          </Link>
                        ) : (
                          <Link href={`/memory/${message.id}`} className="text-ink-soft hover:text-navy">
                            {dictionary.memory.preserveAction}
                          </Link>
                        )}
                        <Link href={`/share/${message.id}`} className="text-ink-soft hover:text-navy">
                          {dictionary.share.shareAction}
                        </Link>
                      </>
                    )}
                    {eligibleForWall && (
                      <WallVisibilityToggle
                        messageId={message.id}
                        showOnPersonalWall={message.showOnPersonalWall}
                        onChange={(next) =>
                          setMessages((current) =>
                            current.map((m) => (m.id === message.id ? { ...m, showOnPersonalWall: next } : m))
                          )
                        }
                      />
                    )}
                    {editEligible && (
                      <EditMessageAction
                        messageId={message.id}
                        content={message.content}
                        onSubmitted={(newContent) =>
                          setMessages((current) =>
                            current.map((m) =>
                              m.id === message.id
                                ? { ...m, pendingContent: newContent, revisionRejectionReason: null }
                                : m
                            )
                          )
                        }
                      />
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* EPIC 024: reuses notifications.pagination* — the wording ("Previous"/
          "Next"/"{page} / {total}") is fully generic, not notification-specific,
          matching CLAUDE.md's existing precedent of reusing dictionary strings
          across features rather than duplicating identical copy under a new key. */}
      {totalPages > 1 && (
        <nav aria-label={dictionary.archive.pageTitle} className="flex items-center justify-between gap-4 pt-2 text-sm">
          {page > 1 ? (
            <Link href={pageHref("/me/archive", searchParams, page - 1)} className="font-medium text-navy hover:text-orange">
              {dictionary.notifications.paginationPrev}
            </Link>
          ) : (
            <span aria-hidden="true" />
          )}
          <span className="text-ink-soft">
            {dictionary.notifications.paginationLabel.replace("{page}", String(page)).replace("{total}", String(totalPages))}
          </span>
          {page < totalPages ? (
            <Link href={pageHref("/me/archive", searchParams, page + 1)} className="font-medium text-navy hover:text-orange">
              {dictionary.notifications.paginationNext}
            </Link>
          ) : (
            <span aria-hidden="true" />
          )}
        </nav>
      )}
    </PageContainer>
  );
}

function WallVisibilityToggle({
  messageId,
  showOnPersonalWall,
  onChange,
}: {
  messageId: string;
  showOnPersonalWall: boolean;
  onChange: (next: boolean) => void;
}) {
  const { dictionary } = useLocale();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    const next = !showOnPersonalWall;
    startTransition(async () => {
      const result = await setMessageWallVisibility(messageId, next);
      if (result.ok) onChange(next);
    });
  }

  return (
    <button type="button" onClick={handleClick} disabled={isPending} className="text-ink-soft hover:text-navy disabled:opacity-50">
      {showOnPersonalWall ? dictionary.archive.removeFromWallAction : dictionary.archive.addToWallAction}
    </button>
  );
}

/**
 * EPIC: Published Note Edit + Re-approval — a published note's "Düzenle"
 * entry point. Built on a native `<dialog>` for the same reasons
 * `ConfirmDialog`/`OnboardingModal` already are (top-layer stacking, focus
 * trapping, Escape-to-close for free) — a small, dedicated dialog rather
 * than reusing `ConfirmDialog` itself, since this needs a full pre-filled
 * textarea, not a reason field. Deliberately does NOT reuse
 * `WriteThoughtForm` — identity/anonymity/language/consent were fixed at
 * submission time and stay out of scope for an edit (see submitMessage's
 * own "anonymity enforced server-side" comment): only the text changes.
 */
function EditMessageAction({
  messageId,
  content,
  onSubmitted,
}: {
  messageId: string;
  content: string;
  onSubmitted: (newContent: string) => void;
}) {
  const { dictionary } = useLocale();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(content);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function openDialog() {
    setDraft(content);
    setError(null);
    setSuccess(false);
    setOpen(true);
  }

  function closeDialog() {
    setOpen(false);
  }

  function handleSubmit() {
    setError(null);
    const trimmed = draft.trim();
    if (!trimmed) {
      setError(dictionary.archive.editErrorEmpty);
      return;
    }
    if ([...trimmed].length > MESSAGE_MAX_LENGTH) {
      setError(dictionary.archive.editErrorTooLong);
      return;
    }
    startTransition(async () => {
      const result = await submitMessageRevision(messageId, trimmed);
      if (!result.ok) {
        setError(dictionary.archive.editErrorGeneric);
        return;
      }
      setSuccess(true);
      onSubmitted(trimmed);
    });
  }

  return (
    <>
      <button type="button" onClick={openDialog} className="text-ink-soft hover:text-navy">
        {dictionary.archive.editAction}
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={headingId}
        onCancel={(event) => {
          event.preventDefault();
          closeDialog();
        }}
        onClick={(event) => {
          if (event.target === dialogRef.current) closeDialog();
        }}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-lg border border-border bg-surface p-0 shadow-card backdrop:bg-navy/50 backdrop:backdrop-blur-sm"
      >
        <div className="flex flex-col gap-4 p-5 sm:p-6">
          <h2 id={headingId} className="font-display text-lg font-medium text-navy">
            {dictionary.archive.editDialogTitle}
          </h2>
          {success ? (
            <>
              <p className="text-sm leading-relaxed text-ink-soft">{dictionary.archive.editSuccessMessage}</p>
              <div className="flex justify-end pt-1">
                <Button type="button" size="sm" onClick={closeDialog}>
                  {dictionary.archive.editCancelAction}
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm leading-relaxed text-ink-soft">{dictionary.archive.editExplanation}</p>
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                rows={4}
                maxLength={MESSAGE_MAX_LENGTH}
                className="w-full rounded-md border border-border bg-canvas p-2.5 text-sm text-ink shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange"
              />
              <span className="text-right text-xs text-ink-soft">
                {[...draft].length}/{MESSAGE_MAX_LENGTH}
              </span>
              {error && <p className="text-xs text-red-600">{error}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="ghost" size="sm" onClick={closeDialog}>
                  {dictionary.archive.editCancelAction}
                </Button>
                <Button type="button" size="sm" onClick={handleSubmit} disabled={isPending}>
                  {dictionary.archive.editSubmitAction}
                </Button>
              </div>
            </>
          )}
        </div>
      </dialog>
    </>
  );
}
