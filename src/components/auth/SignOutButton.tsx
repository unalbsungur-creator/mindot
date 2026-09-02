"use client";

import { useLocale } from "@/i18n/LocaleProvider";
import { signOutOfMindot } from "@/features/auth/actions";

/** A <form action> bound to a Server Function, the same shape as GoogleSignInButton. */
export function SignOutButton({ redirectTo = "/" }: { redirectTo?: string }) {
  const { dictionary } = useLocale();

  return (
    <form action={signOutOfMindot.bind(null, redirectTo)}>
      <button type="submit" className="text-sm font-medium text-ink-soft underline-offset-2 hover:text-navy hover:underline">
        {dictionary.common.signOut}
      </button>
    </form>
  );
}
