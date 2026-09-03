"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { Note } from "@/features/notes/components/Note";
import { TemplatePicker } from "@/features/notes/components/TemplatePicker";
import { getActiveNoteTemplates } from "@/features/notes/config/templates";
import type { NoteData } from "@/features/notes/types";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { locales, localeLabels, type Locale } from "@/i18n/config";
import { useLocale } from "@/i18n/LocaleProvider";
import { submitMessage, type SubmitMessageError } from "../actions";
import { CONTENT_CONSENT_VERSION } from "../consent";
import { consumeWriteDraft, saveWriteDraft } from "../lib/draftPersistence";
import { MESSAGE_MAX_LENGTH } from "../types";

interface WriteThoughtFormProps {
  invitationToken?: string;
  /**
   * `null` for a signed-out visitor — deliberate: the write UI (content,
   * template, identity, language) is now shown *before* Google sign-in,
   * not gated behind it, so a person can compose their thought first. See
   * "Mandatory content-responsibility consent" in CLAUDE.md for why, and
   * `WritePageContent`/`InvitePageContent` for the page-level change this
   * required (they used to hide this whole component until authenticated).
   */
  sessionUser: { name: string | null; email: string | null; image: string | null } | null;
  /**
   * EPIC 013: `true` only when `sessionUser` is set AND that account's
   * `status` is "suspended" (a fresh server-side read the page itself did
   * — see WritePageContent/InvitePageContent). Purely a proactive UX
   * signal so a suspended writer sees a clear message before even trying
   * to submit, never the actual enforcement — `submitMessage` re-checks
   * this itself from a fresh DB read regardless of what this prop says.
   */
  isSuspended?: boolean;
}

export function WriteThoughtForm({ invitationToken, sessionUser, isSuspended = false }: WriteThoughtFormProps) {
  const { locale, dictionary } = useLocale();
  const defaultTemplateId = getActiveNoteTemplates()[0]?.id ?? "";

  const [content, setContent] = useState("");
  const [templateId, setTemplateId] = useState(defaultTemplateId);
  const [displayName, setDisplayName] = useState(sessionUser?.name ?? "");
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [language, setLanguage] = useState<Locale>(locale);
  const [consentChecked, setConsentChecked] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [outcome, setOutcome] = useState<{ ok: boolean; error?: SubmitMessageError } | null>(null);

  // Bridges a draft across the one full navigation this flow can't avoid:
  // Google OAuth. See lib/draftPersistence.ts's doc comment for the full
  // reasoning and for why this is a plain client-side localStorage bridge,
  // not a new persistence system.
  const isFirstPersistRunRef = useRef(true);

  useEffect(() => {
    // Deliberately an effect, not a `useState(() => consumeWriteDraft(...))`
    // lazy initializer (react-hooks/set-state-in-effect would normally
    // prefer that): this component is server-rendered (no `localStorage`
    // there) before hydrating on the client, so computing initial state
    // from `localStorage` during a lazy initializer would make the
    // client's first render disagree with the server-rendered HTML — a
    // real hydration mismatch on the textarea's controlled value, not a
    // hypothetical one. Restoring after mount, once, is the correct
    // trade-off here; the extra render this causes is a one-time cost
    // for whichever writer is actually returning from a Google redirect.
    const draft = consumeWriteDraft(invitationToken);
    if (!draft) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setContent(draft.content);
    setTemplateId(draft.templateId);
    setIsAnonymous(draft.isAnonymous);
    setDisplayName(draft.displayName);
    setLanguage(draft.language);
    // Only honored if it's still the current consent wording — a bumped
    // CONTENT_CONSENT_VERSION means the writer must re-confirm under the
    // new text, exactly as a fresh, un-ticked checkbox would.
    setConsentChecked(draft.consentAccepted && draft.consentVersion === CONTENT_CONSENT_VERSION);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restore is a one-time, mount-only read of whatever draft is currently in storage
  }, []);

  useEffect(() => {
    // Skip the very first run: either there's nothing worth persisting yet,
    // or the restore effect above is still mid-flight and this closure's
    // `content`/etc. are still the pre-restore defaults — persisting them
    // now would immediately clobber the draft we're trying to restore. The
    // next run (triggered by that restore's own state updates, or by any
    // real edit) always reflects current values correctly.
    if (isFirstPersistRunRef.current) {
      isFirstPersistRunRef.current = false;
      return;
    }
    if (sessionUser) return; // already signed in — no OAuth redirect ahead, nothing to bridge
    saveWriteDraft({
      content,
      templateId,
      isAnonymous,
      displayName,
      language,
      invitationToken,
      consentAccepted: consentChecked,
      consentVersion: CONTENT_CONSENT_VERSION,
    });
  }, [sessionUser, content, templateId, isAnonymous, displayName, language, consentChecked, invitationToken]);

  const charCount = [...content].length;
  const overLimit = charCount > MESSAGE_MAX_LENGTH;
  const hasContent = content.trim().length > 0 && !overLimit;
  const canSubmit = hasContent && consentChecked && !isPending && !isSuspended;
  const canContinueToGoogle = hasContent && consentChecked && !isSuspended;
  const redirectTo = invitationToken ? `/invite/${invitationToken}` : "/write";

  const previewAuthor = isAnonymous
    ? dictionary.write.previewAuthorFallback
    : displayName.trim() || sessionUser?.name || dictionary.write.previewAuthorFallback;

  const previewNote: NoteData = {
    id: "preview",
    content: content || dictionary.write.contentPlaceholder,
    authorName: previewAuthor,
    authorImage: isAnonymous ? null : (sessionUser?.image ?? null),
    templateId,
    size: "md",
    rotation: -2,
    position: { top: "0%", left: "0%" },
    language,
  };

  const errorMessage: Record<SubmitMessageError, string> = {
    "auth-required": dictionary.write.signInRequired,
    "account-suspended": dictionary.write.errorAccountSuspended,
    "consent-required": dictionary.write.errorConsentRequired,
    "empty-content": dictionary.write.errorEmpty,
    "too-long": dictionary.write.errorTooLong,
    "invalid-template": dictionary.write.errorGeneric,
    "invitation-invalid": dictionary.write.errorGeneric,
    "invitation-inactive": dictionary.write.errorGeneric,
  };

  function handleSubmit() {
    if (!canSubmit) return;

    startTransition(async () => {
      const result = await submitMessage({
        content,
        templateId,
        authorName: displayName,
        isAnonymous,
        language,
        invitationToken,
        consentAccepted: consentChecked,
        consentVersion: CONTENT_CONSENT_VERSION,
      });
      setOutcome({ ok: result.ok, error: result.error });
      if (result.ok) setContent("");
    });
  }

  if (outcome?.ok) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-lg border border-border bg-surface p-10 text-center">
        <h2 className="font-display text-2xl font-medium text-navy">{dictionary.write.successTitle}</h2>
        <p className="text-ink-soft">{dictionary.write.successBody}</p>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <Button variant="ghost" onClick={() => setOutcome(null)}>
            {dictionary.write.writeAnotherButton}
          </Button>
          <Link href="/me/archive" className="text-sm font-medium text-ink-soft hover:text-navy">
            {dictionary.profile.archiveLinkLabel}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <label htmlFor="content" className="text-sm font-medium text-navy">
            {dictionary.write.contentLabel}
          </label>
          <textarea
            id="content"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder={dictionary.write.contentPlaceholder}
            rows={5}
            className="w-full rounded-md border border-border bg-surface p-4 text-base leading-relaxed text-ink shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange"
          />
          <span
            className={cn("self-end text-xs", overLimit ? "text-red-600" : "text-ink-soft")}
            aria-live="polite"
          >
            {dictionary.write.characterCount
              .replace("{count}", String(charCount))
              .replace("{max}", String(MESSAGE_MAX_LENGTH))}
          </span>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-navy">{dictionary.write.templateLabel}</span>
          <TemplatePicker
            value={templateId}
            onChange={setTemplateId}
            label={dictionary.write.templateLabel}
            standardLabel={dictionary.write.templateStandardLabel}
            occasionLabel={dictionary.write.templateOccasionLabel}
          />
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-navy">{dictionary.write.identityHeading}</legend>
          <div role="radiogroup" aria-label={dictionary.write.identityHeading} className="grid gap-3 sm:grid-cols-2">
            <IdentityOption
              selected={isAnonymous}
              onSelect={() => setIsAnonymous(true)}
              title={dictionary.write.anonymousLabel}
              hint={dictionary.write.identityAnonymousHint}
            />
            <IdentityOption
              selected={!isAnonymous}
              onSelect={() => setIsAnonymous(false)}
              title={dictionary.write.identityNamedLabel}
              hint={dictionary.write.identityNamedHint}
            />
          </div>

          {!isAnonymous && (
            <div className="flex flex-col gap-2 pt-1">
              <label htmlFor="displayName" className="text-sm font-medium text-navy">
                {dictionary.write.nameLabel}
              </label>
              <input
                id="displayName"
                type="text"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder={dictionary.write.namePlaceholder}
                className="w-full rounded-md border border-border bg-surface p-2.5 text-sm text-ink shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange"
              />
            </div>
          )}
        </fieldset>

        <div className="flex flex-col gap-2">
          <label htmlFor="language" className="text-sm font-medium text-navy">
            {dictionary.write.languageLabel}
          </label>
          <select
            id="language"
            value={language}
            onChange={(event) => setLanguage(event.target.value as Locale)}
            className="w-full max-w-xs rounded-md border border-border bg-surface p-2.5 text-sm text-ink shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange"
          >
            {locales.map((code) => (
              <option key={code} value={code}>
                {localeLabels[code]}
              </option>
            ))}
          </select>
        </div>

        {/* Mandatory content-responsibility consent — shown to every writer,
            signed in or not, before either the Google sign-in button or the
            submit button below becomes clickable. See "Mandatory
            content-responsibility consent" in CLAUDE.md. A real, native
            checkbox (never a styled div) with a clickable <label> and
            focus-visible ring — accessibility requirements from that same
            section, not a nice-to-have. */}
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-canvas p-5">
          <span className="text-sm font-medium text-navy">{dictionary.write.consentHeading}</span>
          <label htmlFor="content-consent" className="flex cursor-pointer items-start gap-3">
            <input
              id="content-consent"
              type="checkbox"
              checked={consentChecked}
              onChange={(event) => setConsentChecked(event.target.checked)}
              required
              className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-border accent-orange focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
            />
            <span className="text-sm leading-relaxed text-ink">{dictionary.write.consentText}</span>
          </label>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pl-7 text-xs text-ink-soft">
            <Link href="/terms" className="hover:text-navy hover:underline">
              {dictionary.footer.terms}
            </Link>
            <span aria-hidden="true">·</span>
            <Link href="/community-guidelines" className="hover:text-navy hover:underline">
              {dictionary.footer.guidelines}
            </Link>
            <span aria-hidden="true">·</span>
            <Link href="/privacy" className="hover:text-navy hover:underline">
              {dictionary.footer.privacy}
            </Link>
          </div>
        </div>

        {isSuspended && (
          // EPIC 013: proactive, not the enforcement — submitMessage
          // re-checks status itself from a fresh DB read regardless.
          // Deliberately no mention of a reason or any other admin-only
          // detail here — see CLAUDE.md's "User UX" section.
          <p role="alert" className="text-sm text-red-600">
            {dictionary.write.errorAccountSuspended}
          </p>
        )}

        {outcome && !outcome.ok && outcome.error && (
          <p role="alert" className="text-sm text-red-600">
            {errorMessage[outcome.error]}
          </p>
        )}

        {sessionUser ? (
          <Button type="button" onClick={handleSubmit} disabled={!canSubmit}>
            {isPending ? dictionary.write.submitting : dictionary.write.submit}
          </Button>
        ) : (
          <div className="flex flex-col items-start gap-2">
            <p className="text-sm text-ink-soft">{dictionary.write.signInRequired}</p>
            <GoogleSignInButton redirectTo={redirectTo} disabled={!canContinueToGoogle} />
          </div>
        )}
        <p className="text-xs text-ink-soft">{dictionary.write.trustNote}</p>
      </div>

      <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-canvas p-8">
        <span className="text-xs font-medium uppercase tracking-wide text-ink-soft">
          {dictionary.write.previewLabel}
        </span>
        <Note note={previewNote} variant="static" />
      </div>
    </div>
  );
}

function IdentityOption({
  selected,
  onSelect,
  title,
  hint,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "flex flex-col items-start gap-1 rounded-md border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange",
        selected ? "border-navy bg-navy/5" : "border-border bg-surface hover:border-navy/40"
      )}
    >
      <span className="text-sm font-medium text-navy">{title}</span>
      <span className="text-xs text-ink-soft">{hint}</span>
    </button>
  );
}
