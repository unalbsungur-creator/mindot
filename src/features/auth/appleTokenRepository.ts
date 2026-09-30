import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { appleSignInTokens } from "@/lib/db/schema";
import { decryptAppleToken, encryptAppleToken } from "./lib/appleTokenCrypto";

/**
 * Stored Sign in with Apple refresh tokens — only ever written encrypted
 * (see lib/appleTokenCrypto.ts) and only read back to revoke them. The
 * encryption key is passed in by the caller from server-side config; this
 * module never logs or returns a token to anything client-facing.
 */
export interface AppleTokenRepository {
  /** Replaces the user's stored token with this sign-in's (Apple issues a new one per authorization). */
  save(userId: string, refreshToken: string, encryptionKey: string): Promise<void>;
  /** The decrypted token, `"none"` if there is none, `"unreadable"` if it no longer decrypts (e.g. the key changed). */
  read(userId: string, encryptionKey: string): Promise<string | "none" | "unreadable">;
}

class DrizzleAppleTokenRepository implements AppleTokenRepository {
  async save(userId: string, refreshToken: string, encryptionKey: string): Promise<void> {
    const db = getDb();
    const encryptedRefreshToken = await encryptAppleToken(refreshToken, userId, encryptionKey);
    const now = new Date();
    await db
      .insert(appleSignInTokens)
      .values({ userId, encryptedRefreshToken, createdAt: now, updatedAt: now })
      .onConflictDoUpdate({ target: appleSignInTokens.userId, set: { encryptedRefreshToken, updatedAt: now } });
  }

  async read(userId: string, encryptionKey: string): Promise<string | "none" | "unreadable"> {
    const db = getDb();
    const [row] = await db.select().from(appleSignInTokens).where(eq(appleSignInTokens.userId, userId)).limit(1);
    if (!row) return "none";
    return (await decryptAppleToken(row.encryptedRefreshToken, userId, encryptionKey)) ?? "unreadable";
  }
}

export const appleTokenRepository: AppleTokenRepository = new DrizzleAppleTokenRepository();
