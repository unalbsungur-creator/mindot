import NextAuth, { type DefaultSession } from "next-auth";
import Google from "next-auth/providers/google";
import { userRepository } from "@/features/users/repository";
import type { UserRole } from "@/features/users/types";
import { getAuthRuntimeConfig } from "@/lib/env";

/**
 * Google-only, JWT-session auth (no Auth.js database adapter): the session
 * itself still lives in an encrypted cookie, exactly as EPIC 002 built it.
 * What's new in EPIC 003 is that every sign-in upserts a row into our own
 * `users` table (via userRepository), so messages/invitations have a real
 * foreign key to point at. Role is resolved once at sign-in and embedded in
 * the JWT — see userRepository.upsertFromGoogleProfile for how the very
 * first administrator gets bootstrapped from ADMIN_EMAILS.
 *
 * Requires GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and AUTH_SECRET at
 * runtime — see .env.example. Without them, sign-in fails at request time
 * with a clear Auth.js error; it does not silently fake a session.
 */

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: UserRole;
    } & DefaultSession["user"];
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
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, profile }) {
      // `profile` is only present right after a fresh sign-in, not on
      // every request that reuses an existing JWT — so this upsert runs
      // once per sign-in, not once per page load.
      if (profile?.sub && typeof profile.email === "string") {
        const user = await userRepository.upsertFromGoogleProfile({
          id: profile.sub,
          email: profile.email,
          name: typeof profile.name === "string" ? profile.name : null,
          image: typeof profile.picture === "string" ? profile.picture : null,
        });
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
