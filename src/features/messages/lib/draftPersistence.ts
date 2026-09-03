import type { Locale } from "@/i18n/config";

/**
 * Bridges a writer's in-progress note across the one full-page navigation
 * this feature can't avoid: Google OAuth. `WriteThoughtForm` now shows the
 * write UI to signed-out visitors too (see "Mandatory content-responsibility
 * consent" in CLAUDE.md) — a person can type a thought, tick the consent
 * checkbox, and only then hit "Continue with Google", which is a real
 * `<form action>` server-function submit (`signInWithGoogle`), i.e. a full
 * navigation to Google and back. React state does not survive that trip.
 *
 * Client-only `localStorage`, wrapped in try/catch like every other
 * localStorage read/write in this codebase (see
 * `features/onboarding/lib/state.ts`) — never a server-side session field,
 * per this task's explicit "don't build a new persistence system, don't
 * touch the OAuth architecture" constraint. The version lives in the
 * storage key itself, the same versioning convention onboarding already
 * established: bump the key if this payload's shape changes, and old
 * values are simply orphaned rather than migrated.
 */
const STORAGE_KEY = "mindot:write-draft:v1";

/** A draft older than this is never restored — a stale, probably-forgotten draft resurrecting itself on an unrelated later visit would be more confusing than helpful. */
const MAX_DRAFT_AGE_MS = 30 * 60 * 1000;

export interface WriteDraft {
  content: string;
  templateId: string;
  isAnonymous: boolean;
  displayName: string;
  language: Locale;
  /** `undefined` for the plain `/write` flow — must match the page being restored into, so an invite-flow draft never resurrects on `/write` or vice versa. */
  invitationToken?: string;
  /** Set only once the writer ticked the consent checkbox before being redirected to Google — restoring it on return continues the same confirmed submission, it does not silently grant a fresh, un-ticked one. */
  consentAccepted: boolean;
  consentVersion: string;
  savedAt: number;
}

export function saveWriteDraft(draft: Omit<WriteDraft, "savedAt">): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...draft, savedAt: Date.now() }));
  } catch {
    // Storage unavailable — the draft simply won't survive the Google redirect; the writer can retype.
  }
}

/**
 * Reads and immediately clears the saved draft — a one-time restore, not a
 * durable draft store. Returns `null` if there is none, it's expired, or
 * its `invitationToken` doesn't match the page currently restoring it.
 */
export function consumeWriteDraft(currentInvitationToken: string | undefined): WriteDraft | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    localStorage.removeItem(STORAGE_KEY);

    const draft = JSON.parse(raw) as WriteDraft;
    if (Date.now() - draft.savedAt > MAX_DRAFT_AGE_MS) return null;
    if (draft.invitationToken !== currentInvitationToken) return null;
    return draft;
  } catch {
    return null;
  }
}

export function clearWriteDraft(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do — worst case an expired draft is silently ignored on next read anyway.
  }
}
