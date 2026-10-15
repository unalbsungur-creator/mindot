"use client";

import { useId, useState, useTransition } from "react";
import Link from "next/link";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { setWallDescription, setWallVisibility } from "@/features/profile/actions";
import { PUBLIC_WALL_CONSENT_VERSION, type WallVisibilityState } from "@/features/profile/lib/wallConsent";
import { useLocale } from "@/i18n/LocaleProvider";
import { cn } from "@/lib/cn";

const WALL_DESCRIPTION_MAX_LENGTH = 200;

interface WallSettingsProps {
  initialState: WallVisibilityState;
  initialDescription: string | null;
  onStateChange: (state: WallVisibilityState) => void;
}

/**
 * The one place a user controls whether /u/[publicId] shows anything to
 * strangers, plus its optional short description. Both settings post
 * straight through features/profile/actions.ts, which re-derives the
 * acting user from the session itself — this component never passes a
 * userId, so it can't accidentally act on anyone else's account even if
 * misused. `onStateChange` lets the parent (MePageContent) gate the
 * "Share my wall" action on the current state without duplicating it.
 *
 * Turning the wall on always goes through the consent dialog: an
 * unchecked box, then the server's own version check
 * (`setWallVisibility(true, PUBLIC_WALL_CONSENT_VERSION)`). The switch only
 * shows "on" once the server has accepted — no optimistic flip — and
 * Cancel/Escape/backdrop change nothing. Turning it off needs no consent.
 * A wall enabled before consent existed (or under an older version) is
 * "consent-required": closed to visitors, so the switch shows off, with a
 * notice and a way back through the same dialog.
 */
export function WallSettings({ initialState, initialDescription, onStateChange }: WallSettingsProps) {
  const { dictionary } = useLocale();
  const t = dictionary.profile;
  const noticeId = useId();
  const consentId = useId();
  const [state, setState] = useState<WallVisibilityState>(initialState);
  const [consentOpen, setConsentOpen] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);
  const [consentError, setConsentError] = useState(false);
  const [description, setDescription] = useState(initialDescription ?? "");
  const [saved, setSaved] = useState(false);
  const [isTogglePending, startToggleTransition] = useTransition();
  const [isConsentPending, startConsentTransition] = useTransition();
  const [isSavePending, startSaveTransition] = useTransition();

  function changeState(next: WallVisibilityState) {
    setState(next);
    onStateChange(next);
  }

  function openConsent() {
    setConsentChecked(false);
    setConsentError(false);
    setConsentOpen(true);
  }

  function closeConsent() {
    if (isConsentPending) return;
    setConsentOpen(false);
    setConsentChecked(false);
    setConsentError(false);
  }

  function handleToggle() {
    if (state !== "public") {
      openConsent();
      return;
    }
    // Turning off: no consent needed. Optimistic, reverted if the server refuses.
    changeState("off");
    startToggleTransition(async () => {
      const result = await setWallVisibility(false);
      if (!result.ok) changeState("public");
    });
  }

  function handleConsentConfirm() {
    if (!consentChecked) return;
    setConsentError(false);
    startConsentTransition(async () => {
      const result = await setWallVisibility(true, PUBLIC_WALL_CONSENT_VERSION);
      if (!result.ok) {
        setConsentError(true);
        return;
      }
      changeState("public");
      setConsentOpen(false);
      setConsentChecked(false);
    });
  }

  function handleSaveDescription() {
    setSaved(false);
    startSaveTransition(async () => {
      const result = await setWallDescription(description);
      if (!result.ok) return;
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
    });
  }

  const isPublic = state === "public";

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-navy">{t.wallVisibilityLabel}</span>
          <span id={noticeId} className={cn("text-xs", state === "consent-required" ? "text-orange-ink" : "text-ink-soft")}>
            {state === "consent-required" ? t.wallConsentRequiredNotice : isPublic ? t.wallVisibilityOnHint : t.wallVisibilityOffHint}
          </span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={isPublic}
          aria-label={t.wallVisibilityLabel}
          aria-describedby={noticeId}
          onClick={handleToggle}
          disabled={isTogglePending || isConsentPending}
          className={cn(
            "relative h-6 w-11 shrink-0 rounded-pill transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2",
            isPublic ? "bg-navy" : "bg-border"
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-card transition-transform",
              isPublic ? "translate-x-[1.375rem]" : "translate-x-0.5"
            )}
          />
        </button>
      </div>

      {state === "consent-required" && (
        <button
          type="button"
          onClick={openConsent}
          className="min-h-9 self-start rounded-pill border border-border px-3 text-xs font-medium text-navy hover:border-navy/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange"
        >
          {t.wallConsentRequiredAction}
        </button>
      )}

      <ConfirmDialog
        open={consentOpen}
        title={t.wallConsentTitle}
        body={t.wallConsentIntro}
        cancelLabel={t.wallConsentCancel}
        confirmLabel={t.wallConsentConfirm}
        onConfirm={handleConsentConfirm}
        onCancel={closeConsent}
        confirmDisabled={!consentChecked || isConsentPending}
      >
        <ul className="flex list-disc flex-col gap-2 pl-5 text-sm leading-relaxed text-ink-soft">
          {t.wallConsentPoints.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
        <p className="text-xs text-ink-soft">
          {t.wallConsentLegalLinksLabel}{" "}
          <Link href="/terms" target="_blank" rel="noopener noreferrer" className="font-medium text-navy underline">
            {dictionary.footer.terms}
          </Link>
          {" · "}
          <Link href="/privacy" target="_blank" rel="noopener noreferrer" className="font-medium text-navy underline">
            {dictionary.footer.privacy}
          </Link>
          {" · "}
          {t.wallConsentVersionLabel.replace("{version}", PUBLIC_WALL_CONSENT_VERSION)}
        </p>
        <div className="flex items-start gap-2">
          <input
            id={consentId}
            type="checkbox"
            checked={consentChecked}
            onChange={(event) => setConsentChecked(event.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-navy"
          />
          <label htmlFor={consentId} className="text-sm font-medium text-navy">
            {t.wallConsentCheckbox}
          </label>
        </div>
        {consentError && (
          <p role="alert" className="text-sm text-red-600">
            {t.wallConsentError}
          </p>
        )}
      </ConfirmDialog>

      <div className="flex flex-col gap-2">
        <label htmlFor="wall-description" className="text-sm font-medium text-navy">
          {t.wallDescriptionLabel}
        </label>
        <textarea
          id="wall-description"
          value={description}
          onChange={(event) => setDescription(event.target.value.slice(0, WALL_DESCRIPTION_MAX_LENGTH))}
          placeholder={t.wallDescriptionPlaceholder}
          rows={2}
          className="w-full rounded-md border border-border bg-canvas p-2.5 text-sm text-ink shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange"
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-ink-soft">
            {description.length} / {WALL_DESCRIPTION_MAX_LENGTH}
          </span>
          <button
            type="button"
            onClick={handleSaveDescription}
            disabled={isSavePending}
            className="min-h-9 rounded-pill border border-border px-3 text-xs font-medium text-ink-soft hover:text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange"
          >
            {saved ? t.wallDescriptionSaved : t.wallDescriptionSave}
          </button>
        </div>
      </div>
    </div>
  );
}
