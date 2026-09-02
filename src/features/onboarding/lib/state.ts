import type { OnboardingOutcome } from "../types";

/**
 * The version lives in the storage key itself, matching the pattern the
 * original homepage guide already established. If onboarding content ever
 * changes enough that returning users who saw v1 should see the new
 * version once, bump this to "mindot:onboarding:v2" — the old value is
 * simply orphaned under a key nobody reads anymore, so onboarding shows
 * again exactly once for everyone with no migration logic required.
 */
const STORAGE_KEY = "mindot:onboarding:v1";

const OPEN_REQUEST_EVENT = "mindot-onboarding-open-request";

// localStorage can throw (private-mode Safari, storage blocked by policy) —
// never let a storage read/write crash the app over an onboarding banner.
export function hasSeenOnboarding(): boolean {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "completed" || value === "skipped";
  } catch {
    return false;
  }
}

export function recordOnboardingOutcome(outcome: OnboardingOutcome): void {
  try {
    localStorage.setItem(STORAGE_KEY, outcome);
  } catch {
    // Storage unavailable — onboarding will just be offered again next visit.
  }
}

/**
 * The one manual reopen entry point (SiteFooter) dispatches this; the
 * onboarding modal — mounted once in the root layout, so it's present on
 * every page — listens and opens itself. A plain window event rather than
 * lifted React state, matching how the original homepage guide already
 * coordinated its own dismiss action across the tree.
 */
export function requestOnboardingOpen(): void {
  window.dispatchEvent(new Event(OPEN_REQUEST_EVENT));
}

export function subscribeToOnboardingOpenRequests(onOpen: () => void): () => void {
  window.addEventListener(OPEN_REQUEST_EVENT, onOpen);
  return () => window.removeEventListener(OPEN_REQUEST_EVENT, onOpen);
}
