"use client";

import { useState, useTransition } from "react";
import { setWallDescription, setWallVisibility } from "@/features/profile/actions";
import { useLocale } from "@/i18n/LocaleProvider";
import { cn } from "@/lib/cn";

const WALL_DESCRIPTION_MAX_LENGTH = 200;

interface WallSettingsProps {
  initialEnabled: boolean;
  initialDescription: string | null;
  onEnabledChange: (enabled: boolean) => void;
}

/**
 * The one place a user controls whether /u/[publicId] shows anything to
 * strangers, plus its optional short description. Both settings post
 * straight through features/profile/actions.ts, which re-derives the
 * acting user from the session itself — this component never passes a
 * userId, so it can't accidentally act on anyone else's account even if
 * misused. `onEnabledChange` lets the parent (MePageContent) gate the
 * "Share my wall" action on the current toggle state without duplicating
 * it in local state.
 */
export function WallSettings({ initialEnabled, initialDescription, onEnabledChange }: WallSettingsProps) {
  const { dictionary } = useLocale();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [description, setDescription] = useState(initialDescription ?? "");
  const [saved, setSaved] = useState(false);
  const [isTogglePending, startToggleTransition] = useTransition();
  const [isSavePending, startSaveTransition] = useTransition();

  function handleToggle() {
    const next = !enabled;
    setEnabled(next);
    onEnabledChange(next);
    startToggleTransition(async () => {
      const result = await setWallVisibility(next);
      if (!result.ok) {
        // Session expired or similar — revert the optimistic flip rather
        // than leave the UI claiming a state the server never persisted.
        setEnabled(!next);
        onEnabledChange(!next);
      }
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

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-navy">{dictionary.profile.wallVisibilityLabel}</span>
          <span className="text-xs text-ink-soft">
            {enabled ? dictionary.profile.wallVisibilityOnHint : dictionary.profile.wallVisibilityOffHint}
          </span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={dictionary.profile.wallVisibilityLabel}
          onClick={handleToggle}
          disabled={isTogglePending}
          className={cn(
            "relative h-6 w-11 shrink-0 rounded-pill transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2",
            enabled ? "bg-navy" : "bg-border"
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-card transition-transform",
              enabled ? "translate-x-[1.375rem]" : "translate-x-0.5"
            )}
          />
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="wall-description" className="text-sm font-medium text-navy">
          {dictionary.profile.wallDescriptionLabel}
        </label>
        <textarea
          id="wall-description"
          value={description}
          onChange={(event) => setDescription(event.target.value.slice(0, WALL_DESCRIPTION_MAX_LENGTH))}
          placeholder={dictionary.profile.wallDescriptionPlaceholder}
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
            {saved ? dictionary.profile.wallDescriptionSaved : dictionary.profile.wallDescriptionSave}
          </button>
        </div>
      </div>
    </div>
  );
}
