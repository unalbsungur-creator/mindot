"use client";

import { useLocale } from "@/i18n/LocaleProvider";
import { signInWithGoogle } from "@/features/auth/actions";

const GoogleIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 18 18" className="h-4 w-4">
    <path
      fill="#4285F4"
      d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62z"
    />
    <path
      fill="#34A853"
      d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.98v2.33A9 9 0 0 0 9 18z"
    />
    <path
      fill="#FBBC05"
      d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.98A9 9 0 0 0 0 9c0 1.45.35 2.83.98 4.03l2.97-2.33z"
    />
    <path
      fill="#EA4335"
      d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .98 4.97l2.97 2.33C4.66 5.17 6.65 3.58 9 3.58z"
    />
  </svg>
);

/**
 * A <form action> bound to a Server Function — the Google redirect itself
 * needs no client JS, only the translated label does.
 *
 * `disabled` (optional, default `false`): when true, the submit button
 * carries a real HTML `disabled` attribute — the browser refuses to submit
 * the form at all (click or Enter), not just a CSS-dimmed appearance. Used
 * by `WriteThoughtForm` to gate this button behind its mandatory
 * content-responsibility consent checkbox (see CLAUDE.md) before OAuth can
 * ever start; every other caller of this component is unaffected, since
 * the prop defaults to enabled.
 */
export function GoogleSignInButton({ redirectTo, disabled = false }: { redirectTo: string; disabled?: boolean }) {
  const { dictionary } = useLocale();

  return (
    <form action={signInWithGoogle.bind(null, redirectTo)}>
      <button
        type="submit"
        disabled={disabled}
        className="inline-flex h-11 items-center justify-center gap-2.5 rounded-pill border border-border bg-white px-6 text-sm font-medium text-ink shadow-card transition-colors hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:pointer-events-none disabled:opacity-50 disabled:hover:bg-white"
      >
        <GoogleIcon />
        {dictionary.invite.signInWithGoogle}
      </button>
    </form>
  );
}
