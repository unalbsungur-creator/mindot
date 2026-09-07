"use server";

import { AuthError } from "next-auth";
import { signIn, signOut } from "./auth";

export async function signInWithGoogle(redirectTo: string) {
  await signIn("google", { redirectTo });
}

export async function signOutOfMindot(redirectTo: string) {
  await signOut({ redirectTo });
}

export type AdminSignInError = "invalid-credentials" | "generic";
export type AdminSignInResult = { ok: true } | { ok: false; error: AdminSignInError };

/**
 * EPIC 030: the admin login form's Server Action. `authorize()` in
 * ../auth.ts is the actual security boundary (DB-verified role/status/
 * password/lockout) — this function only translates its outcome into a
 * result the client can render, and never itself decides who's an admin.
 *
 * `redirect: false` so a failed attempt returns control here instead of
 * navigating. Success/failure is read from whether `signIn()` throws:
 * Auth.js throws `AuthError`/`CredentialsSignin` for a `null` `authorize()`
 * result when sign-in is driven from a server-side form action (this
 * project's case) rather than encoding the failure in a redirect URL.
 *
 * BUG FIX (EPIC 030): an earlier version of this function additionally
 * re-verified success by calling `auth()` right after `signIn()` and
 * checking `role === "admin"` before reporting `ok: true`, meant as
 * defense in depth. Real browser testing showed this actually broke
 * correct logins: `auth()` re-reads cookies via `next/headers`, and calling
 * it again inside the *same* Server Action invocation that just called
 * `signIn()` did not reliably observe the session cookie `signIn()` had
 * just set on the outgoing response — a real login would succeed (a valid
 * admin session was genuinely established and visible on the very next
 * navigation) while this function still reported `invalid-credentials` to
 * the user. Removed; whether `signIn()` threw is the correct, sufficient
 * signal.
 */
export async function adminSignIn(username: string, password: string): Promise<AdminSignInResult> {
  try {
    await signIn("credentials", { username, password, redirect: false });
    return { ok: true };
  } catch (error) {
    if (error instanceof AuthError) {
      return { ok: false, error: "invalid-credentials" };
    }
    return { ok: false, error: "generic" };
  }
}
