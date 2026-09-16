"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { Note } from "@/features/notes/components/Note";
import { TemplatePicker } from "@/features/notes/components/TemplatePicker";
import { getActiveNoteTemplates } from "@/features/notes/config/templates";
import { noteFontFamilyClass } from "@/features/notes/lib/textScale";
import type { NoteData, NoteTextFontFamily } from "@/features/notes/types";
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

/**
 * EPIC — Kart Yazı Tipi Seçenekleri: the four font choices, in the order
 * they're shown. Each button's own `className` renders its label in the
 * actual typeface it selects (`noteFontFamilyClass` — the same mapping
 * `Note.tsx` uses for the real card, so this preview is never a second,
 * possibly-drifting source of truth for "which Tailwind class means which
 * font"). "modern" has no extra class — it's the page's own default
 * `font-sans`, exactly like Note.tsx's default case.
 */
const FONT_OPTIONS: {
  value: NoteTextFontFamily;
  labelKey: "fontModernLabel" | "fontClassicLabel" | "fontHandwrittenLabel" | "fontTypewriterLabel";
  className: string;
}[] = [
  { value: "modern", labelKey: "fontModernLabel", className: noteFontFamilyClass("modern") },
  { value: "classic", labelKey: "fontClassicLabel", className: noteFontFamilyClass("classic") },
  { value: "handwritten", labelKey: "fontHandwrittenLabel", className: noteFontFamilyClass("handwritten") },
  { value: "typewriter", labelKey: "fontTypewriterLabel", className: noteFontFamilyClass("typewriter") },
];

export function WriteThoughtForm({ invitationToken, sessionUser, isSuspended = false }: WriteThoughtFormProps) {
  const { locale, dictionary } = useLocale();
  const defaultTemplateId = getActiveNoteTemplates()[0]?.id ?? "";

  const [content, setContent] = useState("");
  const [templateId, setTemplateId] = useState(defaultTemplateId);
  const [fontFamily, setFontFamily] = useState<NoteTextFontFamily>("modern");
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

  // EPIC 033: on a real (especially LAN/mobile) device, a fast typist can
  // get a keystroke's onChange in before the mount-only restore effect
  // below has actually run (effect flush is async; it's not guaranteed to
  // win a race against a real DOM event). Every field setter marks this
  // ref synchronously, so by the time restore runs, it can reliably tell
  // "user already touched the form" from "nothing has happened yet" and
  // skip clobbering real input with a stale draft — confirmed as a real
  // race, not hypothetical.
  const userEditedRef = useRef(false);
  function markEdited() {
    userEditedRef.current = true;
  }

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
    // The writer already started typing before this restore could run —
    // never overwrite real input with a stale draft. Still consumed above
    // so the stale entry doesn't linger in storage.
    if (userEditedRef.current) return;
    setContent(draft.content);
    setTemplateId(draft.templateId);
    setFontFamily(draft.fontFamily ?? "modern");
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
      fontFamily,
      isAnonymous,
      displayName,
      language,
      invitationToken,
      consentAccepted: consentChecked,
      consentVersion: CONTENT_CONSENT_VERSION,
    });
  }, [sessionUser, content, templateId, fontFamily, isAnonymous, displayName, language, consentChecked, invitationToken]);

  const charCount = [...content].length;
  const overLimit = charCount > MESSAGE_MAX_LENGTH;
  // EPIC 045: an "approaching the limit" visual cue — purely a color
  // change (no new copy needed; `characterCount`'s "{count} / {max}" text
  // already says the number), so it reads as urgency without adding a
  // second string to translate across all five locales.
  const nearLimit = !overLimit && charCount >= MESSAGE_MAX_LENGTH - 15;
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
    fontFamily,
    size: "md",
    rotation: -2,
    position: { top: "0%", left: "0%" },
    language,
  };

  // EPIC 026: explains *why* Submit/Continue-with-Google is disabled — the
  // requirement itself (content + consent) is unchanged, this only makes it
  // visible. `null` once both are satisfied. Reported as "checking the
  // consent box doesn't activate Google sign-in" — the real cause was that
  // the button ALSO requires non-empty content, with nothing on screen ever
  // saying so, so a writer who only noticed the checkbox had no way to know
  // why the button stayed disabled.
  const continueRequirementsHint =
    hasContent && consentChecked
      ? null
      : !hasContent && !consentChecked
        ? dictionary.write.continueRequirementsBoth
        : !hasContent
          ? dictionary.write.continueRequirementsContent
          : dictionary.write.continueRequirementsConsent;

  const errorMessage: Record<SubmitMessageError, string> = {
    "auth-required": dictionary.write.signInRequired,
    "account-suspended": dictionary.write.errorAccountSuspended,
    "rate-limited": dictionary.write.errorRateLimited,
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
        fontFamily,
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
      <div className="flex min-w-0 flex-col gap-6">
        <div className="flex flex-col gap-2">
          <label htmlFor="content" className="text-sm font-medium text-navy">
            {dictionary.write.contentLabel}
          </label>
          <textarea
            id="content"
            value={content}
            onChange={(event) => {
              markEdited();
              setContent(event.target.value);
            }}
            placeholder={dictionary.write.contentPlaceholder}
            rows={5}
            // EPIC 045: native maxLength hard-blocks any keystroke or paste
            // past MESSAGE_MAX_LENGTH — the browser truncates a paste that
            // would exceed it automatically, so no separate paste handler
            // is needed. [...content].length (used by charCount/overLimit
            // below) can only exceed this via a pre-EPIC-045 restored draft
            // (drafts are plain localStorage, saved before this limit
            // existed) — overLimit's existing red-counter + disabled-submit
            // behavior already handles that gracefully.
            maxLength={MESSAGE_MAX_LENGTH}
            className="w-full rounded-md border border-border bg-surface p-4 text-base leading-relaxed text-ink shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange"
          />
          <span
            className={cn(
              "self-end text-xs",
              overLimit ? "text-red-600" : nearLimit ? "text-orange-ink font-medium" : "text-ink-soft"
            )}
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
            onChange={(id) => {
              markEdited();
              setTemplateId(id);
            }}
            label={dictionary.write.templateLabel}
          />
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-navy">{dictionary.write.fontFamilyLabel}</span>
          <div role="radiogroup" aria-label={dictionary.write.fontFamilyLabel} className="flex flex-wrap gap-2">
            {FONT_OPTIONS.map((option) => {
              const selected = fontFamily === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => {
                    markEdited();
                    setFontFamily(option.value);
                  }}
                  className={cn(
                    "shrink-0 rounded-pill border px-4 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange",
                    option.className,
                    selected
                      ? "border-navy bg-navy text-white"
                      : "border-border bg-surface text-ink-soft hover:border-navy/40 hover:text-navy"
                  )}
                >
                  {dictionary.write[option.labelKey]}
                </button>
              );
            })}
          </div>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-navy">{dictionary.write.identityHeading}</legend>
          <div role="radiogroup" aria-label={dictionary.write.identityHeading} className="grid gap-3 sm:grid-cols-2">
            <IdentityOption
              selected={isAnonymous}
              onSelect={() => {
                markEdited();
                setIsAnonymous(true);
              }}
              title={dictionary.write.anonymousLabel}
              hint={dictionary.write.identityAnonymousHint}
            />
            <IdentityOption
              selected={!isAnonymous}
              onSelect={() => {
                markEdited();
                setIsAnonymous(false);
              }}
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
                onChange={(event) => {
                  markEdited();
                  setDisplayName(event.target.value);
                }}
                placeholder={dictionary.write.namePlaceholder}
                // BUG FIX (EPIC 026): text-sm (14px) is below the 16px
                // threshold Mobile Safari uses to auto-zoom the page on
                // focus — text-[16px] prevents that disruptive zoom/scroll
                // jump on a real phone without changing anything else here.
                className="w-full rounded-md border border-border bg-surface p-2.5 text-[16px] text-ink shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange"
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
            onChange={(event) => {
              markEdited();
              setLanguage(event.target.value as Locale);
            }}
            // BUG FIX (EPIC 026): same Mobile Safari auto-zoom issue as
            // #displayName above — this is the publication-language select
            // specifically (independent of the header's interface-language
            // LanguageSwitcher, also fixed this EPIC), reported as
            // "reverts to English": the underlying state was never actually
            // wrong, the disruptive zoom-on-focus just made the picker feel
            // broken on a real device.
            className="w-full max-w-xs rounded-md border border-border bg-surface p-2.5 text-[16px] text-ink shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange"
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
              onChange={(event) => {
                markEdited();
                setConsentChecked(event.target.checked);
              }}
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
          <div className="flex flex-col items-start gap-2">
            <Button type="button" onClick={handleSubmit} disabled={!canSubmit}>
              {isPending ? dictionary.write.submitting : dictionary.write.submit}
            </Button>
            {!isSuspended && continueRequirementsHint && (
              <p className="text-xs text-ink-soft">{continueRequirementsHint}</p>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-start gap-2">
            <p className="text-sm text-ink-soft">{dictionary.write.signInRequired}</p>
            <GoogleSignInButton redirectTo={redirectTo} disabled={!canContinueToGoogle} />
            {!isSuspended && continueRequirementsHint && (
              <p className="text-xs text-ink-soft">{continueRequirementsHint}</p>
            )}
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
