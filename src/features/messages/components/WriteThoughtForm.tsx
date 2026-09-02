"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Note } from "@/features/notes/components/Note";
import { TemplatePicker } from "@/features/notes/components/TemplatePicker";
import { getActiveNoteTemplates } from "@/features/notes/config/templates";
import type { NoteData } from "@/features/notes/types";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { locales, localeLabels, type Locale } from "@/i18n/config";
import { useLocale } from "@/i18n/LocaleProvider";
import { submitMessage, type SubmitMessageError } from "../actions";
import { MESSAGE_MAX_LENGTH } from "../types";

interface WriteThoughtFormProps {
  invitationToken?: string;
  sessionUser: { name: string | null; email: string | null; image: string | null };
}

export function WriteThoughtForm({ invitationToken, sessionUser }: WriteThoughtFormProps) {
  const { locale, dictionary } = useLocale();
  const defaultTemplateId = getActiveNoteTemplates()[0]?.id ?? "";

  const [content, setContent] = useState("");
  const [templateId, setTemplateId] = useState(defaultTemplateId);
  const [displayName, setDisplayName] = useState(sessionUser.name ?? "");
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [language, setLanguage] = useState<Locale>(locale);
  const [isPending, startTransition] = useTransition();
  const [outcome, setOutcome] = useState<{ ok: boolean; error?: SubmitMessageError } | null>(null);

  const charCount = [...content].length;
  const overLimit = charCount > MESSAGE_MAX_LENGTH;
  const canSubmit = content.trim().length > 0 && !overLimit && !isPending;

  const previewAuthor = isAnonymous
    ? dictionary.write.previewAuthorFallback
    : displayName.trim() || sessionUser.name || dictionary.write.previewAuthorFallback;

  const previewNote: NoteData = {
    id: "preview",
    content: content || dictionary.write.contentPlaceholder,
    authorName: previewAuthor,
    authorImage: isAnonymous ? null : sessionUser.image,
    templateId,
    size: "md",
    rotation: -2,
    position: { top: "0%", left: "0%" },
    language,
  };

  const errorMessage: Record<SubmitMessageError, string> = {
    "auth-required": dictionary.write.signInRequired,
    "empty-content": dictionary.write.errorEmpty,
    "too-long": dictionary.write.errorTooLong,
    "invalid-template": dictionary.write.errorGeneric,
    "invitation-invalid": dictionary.write.errorGeneric,
    "invitation-inactive": dictionary.write.errorGeneric,
  };

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;

    startTransition(async () => {
      const result = await submitMessage({
        content,
        templateId,
        authorName: displayName,
        isAnonymous,
        language,
        invitationToken,
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
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
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
          <TemplatePicker value={templateId} onChange={setTemplateId} label={dictionary.write.templateLabel} />
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

        {outcome && !outcome.ok && outcome.error && (
          <p role="alert" className="text-sm text-red-600">
            {errorMessage[outcome.error]}
          </p>
        )}

        <Button type="submit" disabled={!canSubmit}>
          {isPending ? dictionary.write.submitting : dictionary.write.submit}
        </Button>
        <p className="text-xs text-ink-soft">{dictionary.write.trustNote}</p>
      </form>

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
