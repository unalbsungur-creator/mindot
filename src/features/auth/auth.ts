import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { userRepository } from "@/features/users/repository";
import { verifyPassword } from "@/features/users/lib/password";
import type { UserRole } from "@/features/users/types";
import { getAuthRuntimeConfig } from "@/lib/env";

/**
 * Google (normal users) + Credentials (admin only), one Auth.js instance,
 * JWT-session throughout (no Auth.js database adapter): the session itself
 * still lives in an encrypted cookie, exactly as EPIC 002 built it.
 *
 * EPIC 003 upserts a `users` row on every Google sign-in, so
 * messages/invitations have a real foreign key to point at. Role is
 * resolved once at sign-in and embedded in the JWT — see
 * userRepository.upsertFromGoogleProfile for how the very first
 * administrator gets bootstrapped from ADMIN_EMAILS.
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

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: UserRole;
    } & DefaultSession["user"];
  }
  interface User {
    role?: UserRole;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    role?: UserRole;
  }
}

const authRuntime = getAuthRuntimeConfig();

export const { handlers, auth, signIn, signOut } = NextAuth({
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
        username: { label: "Username" },
        password: { label: "Password", type: "password" },
      },
      // EPIC 030: deliberately returns `null` (never throws a
      // custom/hinting error) for every rejection path — unknown username,
      // wrong password, non-admin, suspended, locked out — so the caller
      // can never distinguish *why* a sign-in failed (see
      // features/auth/actions.ts's adminSignIn, which maps every rejection
      // to one single generic message — "no username enumeration" is a
      // hard requirement here, not a nicety).
      async authorize(credentials) {
        const username = typeof credentials?.username === "string" ? credentials.username.trim() : "";
        const password = typeof credentials?.password === "string" ? credentials.password : "";
        if (!username || !password) return null;

        const candidate = await userRepository.getCredentialsByUsername(username);
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
        return { id: candidate.id, name: candidate.name, role: candidate.role };
      },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, profile, user }) {
      // `profile` is only present right after a fresh Google sign-in, not
      // on every request that reuses an existing JWT — so this upsert runs
      // once per sign-in, not once per page load.
      if (profile?.sub && typeof profile.email === "string") {
        const dbUser = await userRepository.upsertFromGoogleProfile({
          id: profile.sub,
          email: profile.email,
          name: typeof profile.name === "string" ? profile.name : null,
          image: typeof profile.picture === "string" ? profile.picture : null,
        });
        token.sub = dbUser.id;
        token.role = dbUser.role;
        return token;
      }
      // `user` is only present right after a fresh sign-in too (any
      // provider) — for Credentials it's exactly the object `authorize()`
      // returned above, already fully vetted server-side against the
      // database (role/status/password), never anything the client sent.
      if (user?.id && user.role) {
        token.sub = user.id;
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        if (token.sub) session.user.id = token.sub;
        if (token.role) session.user.role = token.role;
      }
      return session;
    },
  },
});
