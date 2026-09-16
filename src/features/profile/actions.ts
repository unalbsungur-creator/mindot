"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/features/auth/auth";
import { messageRepository } from "@/features/messages/repository";
import { MESSAGE_MAX_LENGTH } from "@/features/messages/types";
import { userRepository } from "@/features/users/repository";

export type ProfileActionError = "auth-required" | "forbidden" | "empty-content" | "too-long";

export interface ProfileActionResult<T = undefined> {
  ok: boolean;
  error?: ProfileActionError;
  data?: T;
}

/** Enforced here, not just in the client form — see WALL_DESCRIPTION_MAX_LENGTH. */
const WALL_DESCRIPTION_MAX_LENGTH = 200;

/**
 * Turns the caller's own public wall on/off. Every profile setting in this
 * file re-derives the acting user from the session itself — never trusts
 * a userId passed in from the client — so one person can never change
 * another's visibility, description, or wall curation.
 */
export async function setWallVisibility(enabled: boolean): Promise<ProfileActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "auth-required" };

  await userRepository.setPublicWallEnabled(session.user.id, enabled);
  revalidatePath("/me");
  return { ok: true };
}

/** Trims and caps at WALL_DESCRIPTION_MAX_LENGTH server-side; an empty result clears the description (stored as null, not an empty string). */
export async function setWallDescription(description: string): Promise<ProfileActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "auth-required" };

  const trimmed = description.trim().slice(0, WALL_DESCRIPTION_MAX_LENGTH);
  await userRepository.setPublicWallDescription(session.user.id, trimmed || null);
  revalidatePath("/me");
  return { ok: true };
}

/**
 * Adds/removes one message from the caller's own personal wall. The real
 * ownership + eligibility boundary is `messageRepository.setShowOnPersonalWall`'s
 * atomic conditional UPDATE (authorId + approved + non-anonymous, all in
 * the WHERE clause) — a null result here covers "not yours," "doesn't
 * exist," "not approved," and "anonymous" alike, collapsed into one
 * `forbidden` error since none of those are the caller's business to
 * distinguish for a message they don't own.
 */
export async function setMessageWallVisibility(messageId: string, show: boolean): Promise<ProfileActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "auth-required" };

  const updated = await messageRepository.setShowOnPersonalWall(messageId, session.user.id, show);
  if (!updated) return { ok: false, error: "forbidden" };

  revalidatePath("/me/archive");
  revalidatePath("/me");
  return { ok: true };
}

/**
 * EPIC: Published Note Edit + Re-approval — proposes a content change to
 * one of the caller's own already-published messages. Never touches the
 * live, public `content` — see `messageRepository.submitRevision`'s own
 * comment for the atomic ownership/eligibility boundary this stands on
 * (author + approved + no revision already pending, all in one WHERE
 * clause). `empty-content`/`too-long` mirror `submitMessage`'s own
 * validation exactly (same trim + Unicode-aware length check against the
 * same `MESSAGE_MAX_LENGTH`), so an edited note is held to the identical
 * bar a brand-new one already is.
 */
export async function submitMessageRevision(messageId: string, content: string): Promise<ProfileActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "auth-required" };

  const trimmed = content.trim();
  if (!trimmed) return { ok: false, error: "empty-content" };
  if ([...trimmed].length > MESSAGE_MAX_LENGTH) return { ok: false, error: "too-long" };

  const updated = await messageRepository.submitRevision(messageId, session.user.id, trimmed);
  if (!updated) return { ok: false, error: "forbidden" };

  revalidatePath("/me/archive");
  return { ok: true };
}
