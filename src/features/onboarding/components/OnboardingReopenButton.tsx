"use client";

import { useLocale } from "@/i18n/LocaleProvider";
import { requestOnboardingOpen } from "../lib/state";

/**
 * The one reusable manual entry point back into onboarding, after the
 * automatic first-visit showing has been completed or skipped. Works from
 * any page — the modal itself is mounted once in the root layout and
 * listens for this request.
 */
export function OnboardingReopenButton({ className }: { className?: string }) {
  const { dictionary } = useLocale();
  return (
    <button type="button" onClick={requestOnboardingOpen} className={className}>
      {dictionary.onboarding.reopenLabel}
    </button>
  );
}
