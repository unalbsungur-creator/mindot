import { getPublicMessageById } from "@/features/board/repository";
import { getFrameTemplate } from "@/features/memories/config/frameTemplates";
import { digitalAccessCodeRepository, memoryRepository, physicalOrderRepository } from "@/features/memories/repository";
import { messageRepository } from "@/features/messages/repository";
import type { Message } from "@/features/messages/types";
import { userRepository } from "@/features/users/repository";
import type { ArchiveMessage, MemoryLibraryItem, PersonalWallNote, PublicWallResult, TimeRange } from "./types";

const PERSONAL_WALL_LIMIT = 60;
const ARCHIVE_LIMIT = 60;

function toPersonalWallNote(message: Message): PersonalWallNote {
  return {
    id: message.id,
    content: message.content,
    templateId: message.templateId,
    rotation: message.rotation ?? 0,
    language: message.language,
    createdAt: message.createdAt,
  };
}

/**
 * The personal wall's only read path — mirrors board/repository.ts's
 * getTile/getPublicMessageById exactly: privacy filtering happens in the
 * query itself (`messageRepository.listPublicByAuthor`), never by
 * fetching everything and hiding rows in the client. Used by both `/me`
 * (the owner's own preview) and `/u/[publicId]` (the public page) — same
 * function, same guarantee, so there's only one place this rule can drift.
 * Returns `null` for an unknown/unassigned publicId so callers can 404.
 */
export async function getPersonalWallByUserId(userId: string, range?: TimeRange): Promise<PersonalWallNote[]> {
  const messages = await messageRepository.listPublicByAuthor(userId, { range, limit: PERSONAL_WALL_LIMIT });
  return messages.map(toPersonalWallNote);
}

/**
 * The public, stranger-facing read for /u/[publicId] and its share/OG
 * routes — keeps three states distinct rather than collapsing them into
 * `null`/empty (see PublicWallResult). Critically, a disabled wall never
 * reaches `getPersonalWallByUserId` at all: the message query simply never
 * runs, at this layer, not filtered out afterward — see "Personal wall
 * visibility" in CLAUDE.md.
 */
export async function getPublicWall(publicId: string, range?: TimeRange): Promise<PublicWallResult> {
  const user = await userRepository.getByPublicId(publicId);
  if (!user) return { status: "not-found" };

  const profile = { publicId: user.publicId ?? publicId, displayName: user.name ?? "MINDOT", image: user.image };
  if (!user.publicWallEnabled) return { status: "disabled", profile };

  const notes = await getPersonalWallByUserId(user.id, range);
  return { status: "ok", profile, description: user.publicWallDescription, notes };
}

/**
 * The authenticated owner's private archive — every status, own eyes
 * only. The caller is responsible for having already verified the
 * session belongs to `userId` (every page/action in features/profile
 * does this the same way every other authenticated feature does).
 */
export async function getPrivateArchive(userId: string, range?: TimeRange): Promise<ArchiveMessage[]> {
  // Sequential, not Promise.all: two independent single-row-set queries on
  // one user's own data — negligible latency difference either way, and
  // sequential avoids any risk of connection-pool contention on whatever
  // Postgres-compatible backend this runs against.
  const messages = await messageRepository.listByAuthor(userId, { range, limit: ARCHIVE_LIMIT });
  const memoryProjects = await memoryRepository.listByCreator(userId);

  const memoryProjectIdByMessageId = new Map(memoryProjects.map((project) => [project.messageId, project.id]));

  return messages.map((message) => ({
    id: message.id,
    content: message.content,
    templateId: message.templateId,
    language: message.language,
    isAnonymous: message.isAnonymous,
    createdAt: message.createdAt,
    state: message.status === "pending" ? "pending" : message.status === "approved" ? "published" : "not_published",
    memoryProjectId: memoryProjectIdByMessageId.get(message.id) ?? null,
    tile: message.tileX !== null && message.tileY !== null ? { x: message.tileX, y: message.tileY } : null,
    showOnPersonalWall: message.showOnPersonalWall,
  }));
}

/**
 * The owner's Memory Project library — combines EPIC 009 sections 6-8
 * (project list, digital access history, physical order history) into
 * one list, since they're fundamentally the same data (a MemoryProject),
 * just with per-outputType detail. Fetches detail per project in a plain
 * loop rather than a batched join: a user's own project count is small
 * (single/low-double digits in practice), so this is the same
 * intentionally-acceptable small-volume pattern `/memory/[messageId]`
 * already uses for `existingProjects` — see CLAUDE.md's "Performance
 * decisions" for EPIC 009.
 */
export async function getMemoryLibrary(userId: string): Promise<MemoryLibraryItem[]> {
  const projects = await memoryRepository.listByCreator(userId);

  const items: MemoryLibraryItem[] = [];
  // Sequential across projects (and within each project) rather than
  // Promise.all: a user's own project count is small in practice (see the
  // doc comment above), and sequential avoids any risk of connection-pool
  // contention — the same reasoning as getPrivateArchive above.
  for (const project of projects) {
    const message = await getPublicMessageById(project.messageId);
    const physicalOrder =
      project.outputType === "physical_gift" ? await physicalOrderRepository.getByMemoryProjectId(project.id) : null;
    const digitalGranted =
      project.outputType === "digital_frame" ? await digitalAccessCodeRepository.hasRedeemedCodeForProject(project.id) : null;

    items.push({
      projectId: project.id,
      messageId: project.messageId,
      noteContent: message?.content ?? null,
      noteTemplateId: message?.templateId ?? null,
      noteLanguage: message?.language ?? null,
      captureMode: project.captureMode,
      outputType: project.outputType,
      frameName: project.frameTemplateId ? getFrameTemplate(project.frameTemplateId).name : null,
      createdAt: project.createdAt,
      digitalStatus: project.outputType !== "digital_frame" ? "not_applicable" : digitalGranted ? "granted" : "waiting",
      physicalOrder: physicalOrder ? { orderNumber: physicalOrder.orderNumber, status: physicalOrder.status } : null,
    });
  }

  return items;
}
