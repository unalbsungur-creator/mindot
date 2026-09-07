"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/Button";
import { adminSignIn, type AdminSignInError } from "@/features/auth/actions";
import { useLocale } from "@/i18n/LocaleProvider";

/**
 * EPIC 030: the admin login form. Deliberately a plain username/password
 * form, not a second styling of GoogleSignInButton — Google is not an
 * authentication *option* here, it's a different flow entirely for a
 * different audience (see CLAUDE.md's authentication section once updated).
 *
 * Every rejection reason — wrong password, unknown username, a real
 * account that just isn't an admin, a suspended admin, a locked-out
 * account — renders as the exact same `invalidCredentials` message. That's
 * deliberate (no username enumeration), not a missing feature.
 */
export function AdminLoginPageContent() {
  const { dictionary } = useLocale();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<AdminSignInError | undefined>();
  // Same real re-entrancy guard used by ShareCardPicker/SocialShareActions —
  // `isPending` alone drives the disabled UI, but a synchronous ref is what
  // actually blocks a double-submit fired before React commits the first
  // click's pending state.
  const busyRef = useRef(false);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyRef.current) return;
    busyRef.current = true;
    setError(undefined);
    startTransition(async () => {
      try {
        const result = await adminSignIn(username, password);
        if (result.ok) {
          router.push("/admin");
          return;
        }
        setError(result.error);
      } finally {
        busyRef.current = false;
      }
    });
  }

  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center py-16">
      <PageContainer className="mx-auto w-full max-w-sm">
        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-5 rounded-lg border border-border bg-surface p-8 shadow-card"
        >
          <div className="flex flex-col gap-1 text-center">
            <h1 className="font-display text-2xl font-medium text-navy">{dictionary.adminLogin.title}</h1>
            <p className="text-sm text-ink-soft">{dictionary.adminLogin.subtitle}</p>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="admin-username" className="text-sm font-medium text-navy">
              {dictionary.adminLogin.usernameLabel}
            </label>
            <input
              id="admin-username"
              name="username"
              type="text"
              autoComplete="username"
              required
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder={dictionary.adminLogin.usernamePlaceholder}
              // text-[16px], not text-sm: the same Mobile Safari auto-zoom
              // fix as every other form input in this codebase (see
              // WriteThoughtForm/LanguageSwitcher) — below 16px, focusing
              // this field zooms the whole page in on a real phone.
              className="w-full rounded-md border border-border bg-canvas p-2.5 text-[16px] text-ink shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="admin-password" className="text-sm font-medium text-navy">
              {dictionary.adminLogin.passwordLabel}
            </label>
            <input
              id="admin-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={dictionary.adminLogin.passwordPlaceholder}
              className="w-full rounded-md border border-border bg-canvas p-2.5 text-[16px] text-ink shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange"
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error === "invalid-credentials" ? dictionary.adminLogin.invalidCredentials : dictionary.adminLogin.errorGeneric}
            </p>
          )}

          <Button type="submit" disabled={isPending || !username || !password}>
            {isPending ? dictionary.adminLogin.signingIn : dictionary.adminLogin.signInButton}
          </Button>
        </form>
      </PageContainer>
    </div>
  );
}
