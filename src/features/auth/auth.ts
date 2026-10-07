import NextAuth, { type DefaultSession, type NextAuthConfig } from "next-auth";
import Apple from "next-auth/providers/apple";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { userRepository } from "@/features/users/repository";
import { verifyPassword } from "@/features/users/lib/password";
import type { UserRole } from "@/features/users/types";
import { getAuthRuntimeConfig } from "@/lib/env";
import { parseAppleProfile } from "./lib/appleProfile";
import { checkAppleSignIn, checkGoogleSignIn, finishAppleSignIn, finishGoogleSignIn, type ProviderSignInCheck } from "./service";

/**
 * Google (normal users) + Credentials (admin only), one Auth.js instance,
 * JWT-session throughout (no Auth.js database adapter): the session itself
 * still lives in an encrypted cookie, exactly as EPIC 002 built it.
 *
 * EPIC 003 upserts a `users` row on every Google sign-in, so
 * messages/invitations have a real foreign key to point at. Role is
 * resolved once at sign-in and embedded in the JWT — but a Google sign-in
 * always creates a plain "user" row (see
 * userRepository.upsertFromGoogleProfile), never "admin", regardless of
 * email. EPIC 035 removed the earlier ADMIN_EMAILS email-match bootstrap
 * entirely: admin is exclusively the dedicated Credentials identity below,
 * provisioned out-of-band by `npm run db:create-admin` — Google can never
 * grant it.
 *
 * EPIC 030 adds Credentials *only* so the admin account is never
 * hostage to Google OAuth being reachable (e.g. a redirect_uri_mismatch
 * console misconfiguration). It never creates or upserts a user — unlike
 * Google sign-in, a credentials account must already exist (created once,
 * out-of-band, by `npm run db:create-admin`; see that script). `authorize()`
 * is the entire security boundary: it re-reads role/status/lockout from the
 * database on every attempt and returns `null` for anything short of an
 * active admin with a matching password hash — the `jwt` callback below
 * only ever trusts what `authorize()` already decided, never a client
 * input.
 *
 * Requires GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and AUTH_SECRET at
 * runtime — see .env.example. Without them, Google sign-in fails at request
 * time with a clear Auth.js error; it does not silently fake a session.
 * Credentials sign-in works independently of those two Google variables.
 */

/**
 * EPIC 031: explicit, deterministic identity of *how* a session was
 * established — never inferred from `role` or from which fields happen to
 * be populated. `role` answers "what can this session do"; `authProvider`
 * answers "how did this session prove who it is" — two different
 * questions that must stay two different fields, so authorization checks
 * never have to guess. Set exactly once, in the `jwt` callback below, from
 * server-verified data only (Google's own `profile.sub`, or
 * `authorize()`'s already-vetted return value) — never from anything a
 * client could influence.
 */
export type AuthProvider = "google" | "apple" | "credentials";

/**
 * Where a refused or failed sign-in lands: /login shows a localized,
 * non-technical message for these codes (and a generic one for Auth.js's
 * own error codes) — never provider details or secrets.
 */
export type SignInRefusal = "account-exists" | "apple-email-missing";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: UserRole;
      authProvider: AuthProvider;
    } & DefaultSession["user"];
  }
  interface User {
    role?: UserRole;
    authProvider?: AuthProvider;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    role?: UserRole;
    authProvider?: AuthProvider;
  }
}

const authRuntime = getAuthRuntimeConfig();

/**
 * Sign in with Apple (web). Registered only when AUTH_APPLE_ID and
 * AUTH_APPLE_SECRET are configured, so an unconfigured deployment never
 * shows a button that can't work. Auth.js's built-in provider keeps its
 * OIDC `state` + `nonce` checks; `profile` below is Auth.js's own output,
 * but the jwt callback derives identity from the verified claims instead
 * (see parseAppleProfile).
 */
const appleProviders: NextAuthConfig["providers"] = authRuntime.appleEnabled
  ? [Apple({ clientId: authRuntime.appleId, clientSecret: authRuntime.appleSecret })]
  : [];

/**
 * Apple returns the user with a cross-site form POST (response_mode
 * form_post), and browsers don't send SameSite=Lax cookies on cross-site
 * POSTs — so the short-lived, encrypted OAuth check cookies (`state`,
 * `nonce`) and the post-sign-in `callbackUrl` must be SameSite=None, or
 * every Apple callback fails its checks. SameSite=None requires Secure,
 * hence HTTPS origins only (Apple doesn't allow anything else anyway). The
 * session cookie itself stays SameSite=Lax. Google is unaffected: its
 * callback is a same-site-navigation GET either way.
 */
const crossSiteCallbackCookies: NextAuthConfig["cookies"] =
  authRuntime.appleEnabled && authRuntime.secureOrigin
    ? {
        state: { options: { sameSite: "none", secure: true } },
        nonce: { options: { sameSite: "none", secure: true } },
        callbackUrl: { options: { sameSite: "none", secure: true } },
      }
    : undefined;

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Auth.js error redirects land on /login with an `?error=` code instead
  // of Auth.js's built-in pages: a cancelled Apple/Google consent goes to
  // `signIn` (OAuthCallbackError), a failed check or config problem to
  // `error`. /login shows only a generic or allow-listed message.
  pages: { signIn: "/login", error: "/login" },
  cookies: crossSiteCallbackCookies,
  providers: [
    Google({
      clientId: authRuntime.clientId,
      clientSecret: authRuntime.clientSecret,
      // Identity only: no Gmail/Drive/Calendar scopes, nothing beyond
      // what's needed to know who someone is.
      authorization: { params: { scope: "openid email profile" } },
    }),
    Credentials({
      credentials: {
        email: { label: "Email" },
        password: { label: "Password", type: "password" },
      },
      // EPIC 030: deliberately returns `null` (never throws a
      // custom/hinting error) for every rejection path — unknown email,
      // wrong password, non-admin, suspended, locked out — so the caller
      // can never distinguish *why* a sign-in failed (see
      // features/auth/actions.ts's adminSignIn, which maps every rejection
      // to one single generic message — "no email enumeration" is a
      // hard requirement here, not a nicety).
      //
      // EPIC 036: the login identity is email, not username — `username`
      // still exists on the row (and stays unique) but a sign-in attempt
      // is looked up by `email` now. Email is trimmed+lowercased before
      // the lookup (case-insensitive, matching how the one admin row's
      // email was provisioned); the password is never normalized — a
      // password is compared byte-for-byte via the existing scrypt
      // verifier, exactly as before.
      async authorize(credentials) {
        const email = typeof credentials?.email === "string" ? credentials.email.trim().toLowerCase() : "";
        const password = typeof credentials?.password === "string" ? credentials.password : "";
        if (!email || !password) return null;

        const candidate = await userRepository.getCredentialsByEmail(email);
        if (!candidate) return null;
        // Credentials sign-in is admin-only by design (see file doc
        // comment) and suspension is re-checked here even though today
        // only an admin account ever has a passwordHash — belt-and-braces
        // against this ever being repurposed for a non-admin account later.
        if (candidate.role !== "admin" || candidate.status !== "active") return null;
        if (candidate.lockedUntil && candidate.lockedUntil.getTime() > Date.now()) return null;

        const passwordMatches = await verifyPassword(password, candidate.passwordHash);
        if (!passwordMatches) {
          await userRepository.recordFailedLogin(candidate.id);
          return null;
        }
        await userRepository.recordSuccessfulLogin(candidate.id);
        return { id: candidate.id, name: candidate.name, role: candidate.role, authProvider: "credentials" };
      },
    }),
    ...appleProviders,
  ],
  session: { strategy: "jwt" },
  callbacks: {
    /**
     * Before an OAuth sign-in may create an account: refuse (redirect to
     * /login with a reason) if its email already belongs to a *different*
     * account — never merge by email (see
     * userRepository.classifyProviderSignIn) — or if a new Apple account
     * came without any email. A returned path goes through Auth.js's
     * same-origin redirect check. Credentials sign-ins were already fully
     * decided by `authorize()`.
     */
    async signIn({ account, profile }) {
      // The account rules themselves live in ./service (shared with any
      // future non-Auth.js sign-in); this only adapts the outcome to
      // Auth.js: a redirect with an allow-listed reason, or a plain refusal.
      let check: ProviderSignInCheck;
      if (account?.provider === "google") {
        const sub = typeof profile?.sub === "string" ? profile.sub : null;
        if (!sub) return false;
        check = await checkGoogleSignIn({
          sub,
          email: typeof profile?.email === "string" ? profile.email : null,
          name: null,
          picture: null,
        });
      } else if (account?.provider === "apple") {
        const identity = parseAppleProfile(profile);
        if (!identity) return false;
        check = await checkAppleSignIn(identity);
      } else {
        return true;
      }

      if (check.ok) return true;
      if (check.refusal === "account-exists") return `/login?error=${"account-exists" satisfies SignInRefusal}`;
      if (check.refusal === "apple-email-missing") return `/login?error=${"apple-email-missing" satisfies SignInRefusal}`;
      return false;
    },
    async jwt({ token, profile, user, account }) {
      // Sign in with Apple — only right after a fresh Apple sign-in. The
      // role is always "user", whatever the row says: Apple can never
      // produce an admin session. The display name comes from the database
      // (never Auth.js's default, which falls back to the — possibly
      // private-relay — email); no avatar from Apple.
      if (account?.provider === "apple") {
        const identity = parseAppleProfile(profile);
        if (!identity) throw new Error("Invalid Apple profile.");
        // Apple's refresh token exists only here, in this sign-in's token
        // response — kept, encrypted, solely so account deletion can revoke
        // it at Apple (see features/users/accountDeletion.ts). Never put in
        // the JWT, never logged. The web flow is the "web" Apple client.
        const refreshToken =
          typeof account.refresh_token === "string" && account.refresh_token && authRuntime.appleTokenKey
            ? { refreshToken: account.refresh_token, encryptionKey: authRuntime.appleTokenKey }
            : null;
        const { user: dbUser, role } = await finishAppleSignIn(identity, "web", refreshToken);
        token.sub = dbUser.id;
        token.role = role;
        token.authProvider = "apple";
        token.name = dbUser.name;
        token.email = dbUser.email;
        token.picture = null;
        return token;
      }
      // `profile` is only present right after a fresh Google sign-in, not
      // on every request that reuses an existing JWT — so this upsert runs
      // once per sign-in, not once per page load.
      if (account?.provider === "google" && profile?.sub && typeof profile.email === "string") {
        const { user: dbUser, role } = await finishGoogleSignIn({
          sub: profile.sub,
          email: profile.email,
          name: typeof profile.name === "string" ? profile.name : null,
          picture: typeof profile.picture === "string" ? profile.picture : null,
        });
        token.sub = dbUser.id;
        token.role = role;
        // EPIC 031: deterministic, not inferred — a Google sign-in is
        // always "google", full stop, regardless of what role the account
        // happens to hold. This is what lets authorization code (and any
        // future code) tell "how" apart from "what" instead of overloading
        // `role` to answer both.
        token.authProvider = "google";
        return token;
      }
      // `user` is only present right after a fresh sign-in too (any
      // provider) — for Credentials it's exactly the object `authorize()`
      // returned above, already fully vetted server-side against the
      // database (role/status/password), never anything the client sent.
      if (user?.id && user.role && user.authProvider) {
        token.sub = user.id;
        token.role = user.role;
        token.authProvider = user.authProvider;
        return token;
      }
      // Every later request reusing an existing JWT: a JWT can't be revoked
      // on its own, so re-check that its account still exists — once an
      // account is deleted (userRepository.deleteAccount removes the row),
      // any copy of its old cookie stops authenticating immediately.
      // Returning null makes Auth.js treat the request as signed out and
      // clear the cookie. A database *error* keeps the session instead
      // (fail-open): Auth.js clears the cookie on any thrown error, which
      // would sign everyone out during a transient outage, and a deleted
      // account can't be reached without the database anyway.
      if (token.sub) {
        try {
          if (!(await userRepository.isActiveAccount(token.sub))) return null;
        } catch (error) {
          console.error("[auth] account check failed", error instanceof Error ? error.name : "unknown");
        }
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        if (token.sub) session.user.id = token.sub;
        if (token.role) session.user.role = token.role;
        if (token.authProvider) session.user.authProvider = token.authProvider;
      }
      return session;
    },
  },
});
