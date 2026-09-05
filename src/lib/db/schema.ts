import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  index,
  integer,
  pgEnum,
  pgSequence,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Drizzle schema — the single source of truth for the database shape.
 * Run `npm run db:generate` after editing this file, then `npm run
 * db:migrate` to apply the generated SQL. See README.md for local setup.
 */

export const userRoleEnum = pgEnum("user_role", ["user", "admin"]);
// EPIC 013: User Blocking / Suspension. Deliberately independent of
// `userRoleEnum` above — role (user/admin) governs *permissions*, this
// governs *submission eligibility*. A suspended admin keeps full admin
// access (requireAdmin() only ever checks role); they just can't submit
// new board content themselves either, same as any other suspended
// account. Two values only — no "banned"/"restricted" tier was justified
// by anything in this product: suspension already means exactly one thing
// (blocks new message submission; existing approved content is
// unaffected — see messages/actions.ts's submitMessage and CLAUDE.md's
// "Suspension semantics" section for the full reasoning).
export const userAccountStatusEnum = pgEnum("user_account_status", ["active", "suspended"]);
export const invitationStatusEnum = pgEnum("invitation_status", ["active", "used", "revoked"]);
// EPIC: E-mail Daveti — independent of `invitationStatusEnum` above: an
// invitation can be "active" (usable) while its email delivery is
// "failed" or "not_configured" — the link still works either way, see
// features/email/. "not_requested" is the default (no recipientEmail was
// given, or the invitation predates this feature).
export const invitationEmailStatusEnum = pgEnum("invitation_email_status", [
  "not_requested",
  "sent",
  "failed",
  "not_configured",
]);
// EPIC: Approved Message Management — "archived" added additively. An
// archived message was once approved and public, then pulled from the
// board by an admin without deleting it: distinct from "rejected" (which
// means a pending message was never published at all). See
// features/messages/repository.ts's archive()/restore().
export const messageStatusEnum = pgEnum("message_status", ["pending", "approved", "rejected", "archived"]);
// The AI pre-screen's verdict — see features/moderation. Distinct from
// messageStatusEnum: this is advisory input for the admin, never a
// publishing decision on its own.
export const aiModerationDecisionEnum = pgEnum("ai_moderation_decision", ["safe", "review", "blocked"]);
// EPIC 023: In-App Notifications — one value per V1 event that can produce a
// notification (see features/notifications/events.ts). Deliberately not
// open-ended free text: a strongly-typed, enum-backed set the client's
// dictionary maps to localized copy, the same "enum in the DB, label from
// the dictionary" pattern messageStatusEnum/messageReportReasonEnum etc.
// already use — never a pre-rendered, English-only string stored server-side
// (see CLAUDE.md's "Internationalization": interface language is a
// client-side concern, so notification copy is derived from `type` via the
// dictionary at render time, not frozen into one language at write time).
export const notificationTypeEnum = pgEnum("notification_type", [
  "message_approved",
  "message_rejected",
  "report_resolved",
  "report_dismissed",
]);

export const users = pgTable("users", {
  // Google's stable "sub" claim — the same value next-auth puts in the JWT
  // as `token.sub`, so a session's user id is always this table's key.
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  image: text("image"),
  role: userRoleEnum("role").notNull().default("user"),
  // EPIC 009: the opaque identifier used in /u/[publicId] — never the
  // Google sub or this row's own id. Nullable at the schema level (a NOT
  // NULL column can't be added safely to a table that may already have
  // rows without a data backfill migration) but every new row gets one at
  // insert time; ensurePublicId() lazily backfills any that don't — see
  // features/users/repository.ts and "Public identifier strategy" in
  // CLAUDE.md.
  publicId: text("public_id").unique(),
  // EPIC 011: whether /u/[publicId] shows this user's personal wall to
  // strangers at all. Defaults OFF — privacy-first, opt-in — deliberately
  // different from EPIC 009's implicit "always visible" behavior; see
  // "Personal wall visibility" in CLAUDE.md.
  publicWallEnabled: boolean("public_wall_enabled").notNull().default(false),
  // EPIC 011: optional short line shown on the public wall header when the
  // wall is enabled. No DB-level length cap (same convention as every
  // other free-text column here, e.g. messages.content) — enforced
  // server-side in features/profile/actions.ts instead.
  publicWallDescription: text("public_wall_description"),
  // EPIC 013: account-level submission eligibility — see
  // `userAccountStatusEnum`'s own comment for why this is a separate
  // concept from `role`. `statusReason`/`statusChangedAt`/`statusChangedBy`
  // mirror `messages.moderatedAt`/`moderatedBy`'s shape exactly: the most
  // recent status-changing action's audit trail, overwritten (not
  // appended) by every subsequent suspend/unsuspend — a full history
  // table was deliberately not built for this MVP (see the "Suspension
  // reason" section of CLAUDE.md for why, and how this differs from the
  // separately-scoped EPIC 014 message-moderation-reason work).
  // `statusReason` is cleared to null on unsuspend, since a stale "why
  // suspended" note is meaningless once the account is active again.
  status: userAccountStatusEnum("status").notNull().default("active"),
  statusReason: text("status_reason"),
  statusChangedAt: timestamp("status_changed_at", { withTimezone: true }),
  statusChangedBy: text("status_changed_by").references((): AnyPgColumn => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const invitations = pgTable("invitations", {
  id: text("id").primaryKey(),
  token: text("token").notNull().unique(),
  // Only ever written as "active", "used", or "revoked" directly — never
  // "expired". Expiry is always computed from `expiresAt` at read time via
  // getEffectiveStatus(), the same rule EPIC 002 established.
  status: invitationStatusEnum("status").notNull().default("active"),
  recipientEmail: text("recipient_email"),
  // EPIC: E-mail Daveti — set once, right after creation, by the same
  // Server Action that inserts the row (never by the email provider
  // itself) — see features/invitations/actions.ts's createInvitation.
  emailStatus: invitationEmailStatusEnum("email_status").notNull().default("not_requested"),
  maxUses: integer("max_uses").notNull().default(1),
  usedCount: integer("used_count").notNull().default(0),
  createdBy: text("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  usedAt: timestamp("used_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

/**
 * Assigns the order new approvals are placed on the board. A Postgres
 * sequence (not a counted column) so concurrent approvals get distinct,
 * gap-tolerant values safely — see features/board/lib/placement.ts.
 */
export const messagePlacementSeq = pgSequence("message_placement_seq", { startWith: 1 });

export const messages = pgTable(
  "messages",
  {
    id: text("id").primaryKey(),
    content: text("content").notNull(),
    authorId: text("author_id")
      .notNull()
      .references(() => users.id),
    authorName: text("author_name").notNull(),
    isAnonymous: boolean("is_anonymous").notNull().default(false),
    // EPIC 011: independent per-message curation for the personal wall.
    // Being approved + named makes a message *eligible* for the personal
    // wall; this is the owner's separate choice of whether it actually
    // shows there. Never affects the global board, which reads only
    // status/tileX/tileY. Defaults true so existing approved+named rows
    // keep behaving like EPIC 009 (visible) the moment an owner opts back
    // into a public wall — publicWallEnabled above (default OFF) is the
    // new privacy gate, not this column.
    showOnPersonalWall: boolean("show_on_personal_wall").notNull().default(true),
    // EPIC: Message Like System — a denormalized counter kept in sync with
    // message_likes below (real per-identity dedup rows) so the homepage's
    // "most liked" query can ORDER BY this directly instead of a
    // COUNT()/JOIN on every load. See features/messages/repository.ts's
    // like()/countApproved()/listTopLikedApproved().
    likeCount: integer("like_count").notNull().default(0),
    language: text("language").notNull(),
    // References a NoteTemplate.id from the code-defined template registry
    // (features/notes/config/templates.ts) — templates aren't database rows.
    templateId: text("template_id").notNull(),
    invitationId: text("invitation_id").references(() => invitations.id),
    status: messageStatusEnum("status").notNull().default("pending"),
    // Null until the message is approved and placed — see placement.ts.
    tileX: integer("tile_x"),
    tileY: integer("tile_y"),
    positionX: real("position_x"),
    positionY: real("position_y"),
    rotation: real("rotation"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    // Human moderation — the only thing that can move a message out of
    // "pending". Distinct from the AI fields below, which are advisory.
    moderatedAt: timestamp("moderated_at", { withTimezone: true }),
    moderatedBy: text("moderated_by").references(() => users.id),
    // EPIC 014: the acting admin's own written justification for their most
    // recent approve/reject/archive decision — optional, admin-authored,
    // distinct from `aiModerationReason` (an AI pre-screen's advisory
    // output, never a human's) and from `users.statusReason` (EPIC 013's
    // account-suspension reason — a different entity, a different
    // decision). Follows `moderatedAt`/`moderatedBy`'s own established
    // shape exactly: the latest decision's reason only, overwritten (not
    // appended) by every subsequent transition — restore()/reconsider()
    // deliberately clear this to null rather than leaving a stale reason
    // from a since-reversed decision attached to the message's new state.
    // No separate audit-history table: the state machine already discards
    // moderation history on every transition (moderatedAt/moderatedBy are
    // themselves overwritten, not appended), so introducing history only
    // for this one new field would be inconsistent, not more correct.
    moderationReason: text("moderation_reason"),
    // AI pre-screen, recorded at submission time. Nullable so rows from
    // before this feature existed remain valid; never used to auto-publish
    // or auto-reject — see features/moderation and moderation-actions.ts.
    aiModerationStatus: aiModerationDecisionEnum("ai_moderation_status"),
    aiModerationProvider: text("ai_moderation_provider"),
    aiModerationCategories: text("ai_moderation_categories").array(),
    aiModerationReason: text("ai_moderation_reason"),
    aiModerationConfidence: real("ai_moderation_confidence"),
    aiModeratedAt: timestamp("ai_moderated_at", { withTimezone: true }),
    // EPIC: Consent Audit Persistence — a durable record that the writer
    // accepted the content-responsibility consent (features/messages/
    // consent.ts) at submission time, not just a same-request check that
    // left no trace. `consentAccepted` defaults false (safe for any insert
    // that doesn't set it, e.g. seed.ts's raw insert) so pre-existing rows
    // and any future non-submitMessage insert are never misrepresented as
    // consented. `consentVersion`/`consentAcceptedAt` are nullable and
    // independent of each other only in the sense that both stay null
    // together — messageRepository.create() is what enforces they're only
    // ever set as a matched pair with a real server timestamp, never a
    // client-supplied one. Never backfilled for rows that predate this
    // column: whether an already-published message's author actually saw
    // and accepted this exact consent text can't be reliably reconstructed,
    // so the honest state for those rows is "not recorded," not "true."
    consentAccepted: boolean("consent_accepted").notNull().default(false),
    consentVersion: text("consent_version"),
    consentAcceptedAt: timestamp("consent_accepted_at", { withTimezone: true }),
  },
  (table) => [
    // The public tile query: approved messages for one tile.
    index("messages_status_tile_idx").on(table.status, table.tileX, table.tileY),
    // The moderation queue: pending/reviewed, newest first.
    index("messages_status_created_idx").on(table.status, table.createdAt),
    // EPIC 009: one author's private archive and public wall — both filter
    // on authorId first (status/isAnonymous narrow further for the public
    // wall), then order by createdAt.
    index("messages_author_created_idx").on(table.authorId, table.createdAt),
    // The homepage's "most liked" query: approved messages ordered by like count.
    index("messages_status_like_count_idx").on(table.status, table.likeCount),
  ]
);

/**
 * EPIC: Message Like System — one row per (message, identity) that has
 * liked it, the real dedup mechanism behind messages.likeCount above.
 * Exactly one of userId/anonymousId is set per row:
 *   - Signed-in visitor: userId set, a real identity — the partial unique
 *     index below makes a second like from the same account a no-op at
 *     the database level, not just a client-side check.
 *   - Anonymous visitor: anonymousId set (a client-generated id persisted
 *     in that browser's localStorage — see src/lib/anonymousId.ts). This
 *     is explicitly NOT a security mechanism — it's trivially reset by
 *     clearing site data or using a different browser — only a reasonable
 *     same-browser dedup, exactly as far as an unauthenticated visitor's
 *     identity honestly extends. Never claim otherwise in code that reads
 *     this table.
 */
export const messageLikes = pgTable(
  "message_likes",
  {
    id: text("id").primaryKey(),
    messageId: text("message_id")
      .notNull()
      .references(() => messages.id),
    userId: text("user_id").references(() => users.id),
    anonymousId: text("anonymous_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("message_likes_message_user_idx")
      .on(table.messageId, table.userId)
      .where(sql`${table.userId} is not null`),
    uniqueIndex("message_likes_message_anon_idx")
      .on(table.messageId, table.anonymousId)
      .where(sql`${table.anonymousId} is not null`),
    index("message_likes_message_idx").on(table.messageId),
  ]
);

// EPIC 012: User Content Reporting — categories a reporter picks from,
// grounded in the actual product terminology already used in
// community-guidelines/terms (illegal content, harassment, spam, etc.),
// not invented speculatively. "other" is the escape hatch for anything not
// covered, paired with the free-text `details` field on the row itself.
export const messageReportReasonEnum = pgEnum("message_report_reason", [
  "spam",
  "harassment",
  "hate",
  "sexual_content",
  "violence",
  "illegal",
  "copyright",
  "other",
]);
// A minimal, independent lifecycle — never confused with messageStatusEnum
// above. A report's own status only ever describes whether an admin has
// finished looking at *the report*; it has no bearing on, and is never
// derived from, the reported message's own moderation status.
export const messageReportStatusEnum = pgEnum("message_report_status", ["open", "resolved", "dismissed"]);

/**
 * EPIC 012: User Content Reporting — one row per report. Exactly one of
 * `reporterId`/`anonymousReporterId` is set per row, the identical
 * dedup shape `messageLikes` already established above (signed-in identity
 * vs. this browser's client-generated localStorage id from
 * src/lib/anonymousId.ts) — reused rather than inventing a second
 * "who did this" pattern. The partial unique indexes below are the real
 * "can't report the same message twice" boundary, enforced at the database
 * level, not just a client-side disabled button.
 *
 * Filing a report never touches `messages.status` — see
 * features/reports/actions.ts: this table is advisory input for an admin,
 * exactly like AI pre-screening, never a publishing/removal decision on
 * its own. `reviewedAt`/`reviewedBy` mirror `messages.moderatedAt`/
 * `moderatedBy`'s shape for the same "who and when" audit purpose, kept as
 * a separate pair of columns on this table (not reused from `messages`)
 * since resolving/dismissing a *report* is a distinct action from
 * approving/rejecting/archiving the *message* it's about.
 */
export const messageReports = pgTable(
  "message_reports",
  {
    id: text("id").primaryKey(),
    messageId: text("message_id")
      .notNull()
      .references(() => messages.id),
    reporterId: text("reporter_id").references(() => users.id),
    anonymousReporterId: text("anonymous_reporter_id"),
    reason: messageReportReasonEnum("reason").notNull(),
    details: text("details"),
    status: messageReportStatusEnum("status").notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedBy: text("reviewed_by").references(() => users.id),
  },
  (table) => [
    uniqueIndex("message_reports_message_reporter_idx")
      .on(table.messageId, table.reporterId)
      .where(sql`${table.reporterId} is not null`),
    uniqueIndex("message_reports_message_anon_idx")
      .on(table.messageId, table.anonymousReporterId)
      .where(sql`${table.anonymousReporterId} is not null`),
    index("message_reports_status_created_idx").on(table.status, table.createdAt),
    index("message_reports_message_idx").on(table.messageId),
  ]
);

// --- Memory / print / physical gift (EPIC 006) ---
// See src/features/memories/ and "Memory preservation architecture" in
// CLAUDE.md. A memory project always has exactly one `createdBy` (the
// person preserving the thought) which is deliberately NOT assumed to be
// the message's author — see "message author vs memory creator" there.

export const memoryOutputTypeEnum = pgEnum("memory_output_type", [
  "personal_pdf",
  "digital_frame",
  "physical_gift",
]);
export const memoryCaptureModeEnum = pgEnum("memory_capture_mode", ["note_only", "note_with_surrounding"]);
export const memoryProjectStatusEnum = pgEnum("memory_project_status", ["draft", "ready", "fulfilled"]);
export const digitalAccessCodeStatusEnum = pgEnum("digital_access_code_status", [
  "active",
  "redeemed",
  "expired",
  "revoked",
]);
export const physicalOrderStatusEnum = pgEnum("physical_order_status", [
  "pending",
  "awaiting_dilekkutum_order",
  "matched",
  "in_production",
  "packaged",
  "shipped",
  "completed",
  "cancelled",
]);

export const memoryProjects = pgTable("memory_projects", {
  id: text("id").primaryKey(),
  messageId: text("message_id")
    .notNull()
    .references(() => messages.id),
  // The memory creator / purchaser — never assumed to be messages.authorId.
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id),
  captureMode: memoryCaptureModeEnum("capture_mode").notNull(),
  outputType: memoryOutputTypeEnum("output_type").notNull(),
  // References a FrameTemplate.id from the code-defined registry
  // (features/memories/config/frameTemplates.ts) — not a database row,
  // same pattern as messages.templateId.
  frameTemplateId: text("frame_template_id"),
  status: memoryProjectStatusEnum("status").notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const digitalAccessCodes = pgTable("digital_access_codes", {
  id: text("id").primaryKey(),
  // Null until redeemed: a code can be issued from an external sale before
  // anyone has told MINDOT which project it belongs to — see
  // "Digital product & access code flow" in CLAUDE.md.
  memoryProjectId: text("memory_project_id").references(() => memoryProjects.id),
  code: text("code").notNull().unique(),
  status: digitalAccessCodeStatusEnum("status").notNull().default("active"),
  redeemedAt: timestamp("redeemed_at", { withTimezone: true }),
  redeemedBy: text("redeemed_by").references(() => users.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  // Provider-neutral: "manual" today; "shoppier" once real integration
  // exists — see features/moderation-style provider abstraction in
  // features/memories/providers/.
  externalProvider: text("external_provider"),
  externalReference: text("external_reference"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const physicalOrders = pgTable("physical_orders", {
  id: text("id").primaryKey(),
  memoryProjectId: text("memory_project_id")
    .notNull()
    .references(() => memoryProjects.id),
  // Human-typeable, e.g. "MND-2026-7K3PXQ9H" — entered into the DilekKutum
  // order note to manually match the two orders. Never sequential.
  orderNumber: text("order_number").notNull().unique(),
  status: physicalOrderStatusEnum("status").notNull().default("pending"),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// EPIC 023: In-App Notifications — one row per (recipient, event). See
// features/notifications/ for the repository/actions/event-integration and
// "Notifications" in CLAUDE.md for the full architecture writeup. Deliberately
// minimal: no title/body text columns (see notificationTypeEnum's own comment
// above for why — content is derived client-side from `type`), no delivery
// channel/status columns (in-app only, V1), no read-receipt history beyond
// the single `readAt` timestamp every other "moderated"-style entity in this
// schema already uses for its own single most-recent state change.
export const notifications = pgTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    recipientUserId: text("recipient_user_id")
      .notNull()
      .references(() => users.id),
    type: notificationTypeEnum("type").notNull(),
    // Exactly one of these is populated per V1 event type — messageId alone
    // for message_approved/message_rejected, both for report_resolved/
    // report_dismissed (a report is always about a message). No CHECK
    // constraint enforcing that pairing: both are optional context a reader
    // can follow, not something a query branches on.
    messageId: text("message_id").references(() => messages.id),
    reportId: text("report_id").references(() => messageReports.id),
    // Precomputed at creation time from already-public destinations only
    // (see events.ts) — never a route invented for this feature. Null means
    // safely non-clickable, not a broken link.
    targetUrl: text("target_url"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // The full-history page's only read path: one recipient, newest first.
    index("notifications_recipient_created_idx").on(table.recipientUserId, table.createdAt),
    // countUnreadForUser / markAllAsRead's WHERE: one recipient, unread only.
    index("notifications_recipient_read_idx").on(table.recipientUserId, table.readAt),
  ]
);
