"use client";

import { createContext, useContext, type ReactNode } from "react";
import { AppleSignInButton } from "./AppleSignInButton";
import { GoogleSignInButton } from "./GoogleSignInButton";

const AppleSignInEnabled = createContext(false);

/**
 * Carries one server-side fact to every client-rendered sign-in spot:
 * whether Sign in with Apple is configured on this deployment (see
 * getAuthRuntimeConfig). Set once in the root layout — a boolean, never a
 * credential.
 */
export function SignInOptionsProvider({ appleEnabled, children }: { appleEnabled: boolean; children: ReactNode }) {
  return <AppleSignInEnabled.Provider value={appleEnabled}>{children}</AppleSignInEnabled.Provider>;
}

/**
 * The one normal-user sign-in control — Google, plus Apple where
 * configured — used by /login and every in-page "sign in to continue" spot,
 * so a new provider is added in one place. Both buttons share `redirectTo`
 * and `disabled` (e.g. the write flow's consent gate). Admin sign-in is
 * separate (/admin/login) and never uses this.
 */
export function SignInOptions({
  redirectTo,
  disabled = false,
  align = "center",
}: {
  redirectTo: string;
  disabled?: boolean;
  /** Match the surrounding column — most sign-in spots are centered; the write form is start-aligned. */
  align?: "center" | "start";
}) {
  const appleEnabled = useContext(AppleSignInEnabled);
  return (
    <div className={align === "start" ? "flex flex-col items-start gap-3" : "flex flex-col items-center gap-3"}>
      <GoogleSignInButton redirectTo={redirectTo} disabled={disabled} />
      {appleEnabled && <AppleSignInButton redirectTo={redirectTo} disabled={disabled} />}
    </div>
  );
}
