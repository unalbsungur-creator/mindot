import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { messageReports } from "@/lib/db/schema";
import { messageRepository } from "@/features/messages/repository";
import { userRepository } from "@/features/users/repository";
import type { MessageReport, NewReportInput, ReportQueueItem } from "./types";

/**
 * Repository for the reporting feature — same "nothing outside this file
 * talks to the table directly" shape every other feature repository in
 * this codebase already follows (see messages/repository.ts's own doc
 * comment).
 */
export interface ReportRepository {
  /**
   * The real "can't report the same message twice" boundary: an atomic
   * `onConflictDoNothing` against the partial unique indexes on
   * (messageId, reporterId) / (messageId, anonymousReporterId) — same
   * technique as `messageRepository.like`. Returns `null` for a duplicate,
   * never throws.
   */
  create(input: NewReportInput): Promise<MessageReport | null>;
  /** Open reports, oldest first (first reported, first reviewed) — the admin queue's only read path. */
  listOpen(): Promise<MessageReport[]>;
  /**
   * Marks a report resolved — an admin decided the reported message needed
   * (or already received, via the existing moderation actions) some
   * action. Atomic conditional `UPDATE ... WHERE id = ? AND status =
   * 'open'`, same "the repository method is the real boundary" pattern as
   * approve/reject/archive elsewhere. Never touches `messages.status`.
   */
  resolve(id: string, adminId: string): Promise<MessageReport | null>;
  /** The inverse decision — an admin decided no action was needed. Same atomic conditional shape as resolve(). */
  dismiss(id: string, adminId: string): Promise<MessageReport | null>;
  /** EPIC 022: total currently-open reports — a single aggregate query, AdminNav's Reports badge. */
  countOpen(): Promise<number>;
}

function toReport(row: typeof messageReports.$inferSelect): MessageReport {
  return {
    id: row.id,
    messageId: row.messageId,
    reporterId: row.reporterId,
    anonymousReporterId: row.anonymousReporterId,
    reason: row.reason,
    details: row.details,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    reviewedBy: row.reviewedBy,
  };
}

class DrizzleReportRepository implements ReportRepository {
  async create(input: NewReportInput): Promise<MessageReport | null> {
    const db = getDb();
    const conflictTarget = input.reporterId
      ? [messageReports.messageId, messageReports.reporterId]
      : [messageReports.messageId, messageReports.anonymousReporterId];
    const conflictWhere = input.reporterId
      ? sql`${messageReports.reporterId} is not null`
      : sql`${messageReports.anonymousReporterId} is not null`;

    const [row] = await db
      .insert(messageReports)
      .values({ id: crypto.randomUUID(), ...input })
      .onConflictDoNothing({ target: conflictTarget, where: conflictWhere })
      .returning();

    return row ? toReport(row) : null;
  }

  async listOpen(): Promise<MessageReport[]> {
    const db = getDb();
    const rows = await db
      .select()
      .from(messageReports)
      .where(eq(messageReports.status, "open"))
      .orderBy(messageReports.createdAt);
    return rows.map(toReport);
  }

  async resolve(id: string, adminId: string): Promise<MessageReport | null> {
    const db = getDb();
    const now = new Date();
    const [row] = await db
      .update(messageReports)
      .set({ status: "resolved", reviewedAt: now, reviewedBy: adminId })
      .where(and(eq(messageReports.id, id), eq(messageReports.status, "open")))
      .returning();
    return row ? toReport(row) : null;
  }

  async dismiss(id: string, adminId: string): Promise<MessageReport | null> {
    const db = getDb();
    const now = new Date();
    const [row] = await db
      .update(messageReports)
      .set({ status: "dismissed", reviewedAt: now, reviewedBy: adminId })
      .where(and(eq(messageReports.id, id), eq(messageReports.status, "open")))
      .returning();
    return row ? toReport(row) : null;
  }

  async countOpen(): Promise<number> {
    const db = getDb();
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(messageReports)
      .where(eq(messageReports.status, "open"));
    return row?.count ?? 0;
  }
}

export const reportRepository: ReportRepository = new DrizzleReportRepository();

/**
 * The admin queue's one read path — combines open reports with just enough
 * message/reporter detail to render a real preview, the same
 * "small admin-facing volume, sequential per-item fetch" pattern
 * `getMemoryLibrary`/`getPrivateArchive` already use in features/profile/
 * repository.ts, for the same reason: an admin's open-report count is
 * small in practice, so a batched join isn't worth the complexity here.
 */
export async function getOpenReportQueue(): Promise<ReportQueueItem[]> {
  const reports = await reportRepository.listOpen();
  const items: ReportQueueItem[] = [];

  for (const report of reports) {
    const message = await messageRepository.getById(report.messageId);
    const reporter = report.reporterId ? await userRepository.getById(report.reporterId) : null;

    items.push({
      report,
      message: message
        ? {
            id: message.id,
            content: message.content,
            templateId: message.templateId,
            language: message.language,
            authorName: message.authorName,
            isAnonymous: message.isAnonymous,
            status: message.status,
          }
        : null,
      reporterKind: report.reporterId ? "user" : "anonymous",
      reporterName: reporter ? (reporter.name ?? reporter.email) : null,
    });
  }

  return items;
}
