"use client";

import { useLocale } from "@/i18n/LocaleProvider";
import { signInWithApple } from "@/features/auth/actions";

const AppleIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 17 20" className="h-4 w-4 fill-current">
    <path d="M14.2 10.6c0-2.6 2.1-3.8 2.2-3.9-1.2-1.8-3.1-2-3.8-2-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.4-.9-1.7 0-3.3 1-4.2 2.6-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.5 1.3-.1 1.8-.8 3.3-.8 1.6 0 2 .8 3.4.8 1.4 0 2.3-1.3 3.1-2.5 1-1.4 1.4-2.8 1.4-2.9 0 0-2.7-1-2.6-4ZM11.7 3c.7-.9 1.2-2 1.1-3.2-1 0-2.3.7-3 1.6-.7.8-1.3 2-1.1 3.1 1.1.1 2.3-.6 3-1.5Z" />
  </svg>
);

/**
 * Sign in with Apple (web) — the same server-action form shape as
 * GoogleSignInButton, styled per Apple's guidelines (black, Apple logo,
 * "Continue with Apple" wording) and sized to match the Google button.
 */
export function AppleSignInButton({ redirectTo, disabled = false }: { redirectTo: string; disabled?: boolean }) {
  const { dictionary } = useLocale();

  return (
    <form action={signInWithApple.bind(null, redirectTo)}>
      <button
        type="submit"
        disabled={disabled}
        className="inline-flex h-11 min-w-[14rem] items-center justify-center gap-2.5 rounded-pill bg-black px-6 text-sm font-medium text-white shadow-card transition-colors hover:bg-black/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:pointer-events-none disabled:opacity-50"
      >
        <AppleIcon />
        {dictionary.login.continueWithApple}
      </button>
    </form>
  );
}
