import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { appleSignInTokens, type appleTokenClientEnum } from "@/lib/db/schema";
import { decryptAppleToken, encryptAppleToken } from "./lib/appleTokenCrypto";

/**
 * Stored Sign in with Apple refresh tokens — only ever written encrypted
 * (see lib/appleTokenCrypto.ts) and only read back to revoke them. The
 * encryption key is passed in by the caller from server-side config; this
 * module never logs or returns a token to anything client-facing.
 *
 * Tokens are kept per Apple client — `"web"` (the Services ID) and `"ios"`
 * (the app's bundle ID) — since Apple issues and revokes each under its own
 * client_id. Every call names the client explicitly; a web sign-in never
 * overwrites or reads the iOS token, and vice versa.
 */
export type AppleTokenClient = (typeof appleTokenClientEnum.enumValues)[number];

export interface AppleTokenRepository {
  /** Replaces the user's stored token for this client with this sign-in's (Apple issues a new one per authorization). */
  save(userId: string, client: AppleTokenClient, refreshToken: string, encryptionKey: string): Promise<void>;
  /** The decrypted token for this client, `"none"` if there is none, `"unreadable"` if it no longer decrypts (e.g. the key changed). */
  read(userId: string, client: AppleTokenClient, encryptionKey: string): Promise<string | "none" | "unreadable">;
}

class DrizzleAppleTokenRepository implements AppleTokenRepository {
  async save(userId: string, client: AppleTokenClient, refreshToken: string, encryptionKey: string): Promise<void> {
    const db = getDb();
    const encryptedRefreshToken = await encryptAppleToken(refreshToken, userId, encryptionKey);
    const now = new Date();
    await db
      .insert(appleSignInTokens)
      .values({ userId, client, encryptedRefreshToken, createdAt: now, updatedAt: now })
      .onConflictDoUpdate({
        target: [appleSignInTokens.userId, appleSignInTokens.client],
        set: { encryptedRefreshToken, updatedAt: now },
      });
  }

  async read(userId: string, client: AppleTokenClient, encryptionKey: string): Promise<string | "none" | "unreadable"> {
    const db = getDb();
    const [row] = await db
      .select()
      .from(appleSignInTokens)
      .where(and(eq(appleSignInTokens.userId, userId), eq(appleSignInTokens.client, client)))
      .limit(1);
    if (!row) return "none";
    return (await decryptAppleToken(row.encryptedRefreshToken, userId, encryptionKey)) ?? "unreadable";
  }
}

export const appleTokenRepository: AppleTokenRepository = new DrizzleAppleTokenRepository();
