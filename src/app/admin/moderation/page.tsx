import { auth } from "@/features/auth/auth";
import { messageRepository } from "@/features/messages/repository";
import { userRepository } from "@/features/users/repository";
import { ModerationPageContent } from "./_components/ModerationPageContent";

export default async function ModerationPage() {
  const session = await auth();
  const authorized = session?.user?.role === "admin";

  // Unauthorized visitors never receive any message content in the
  // rendered payload at all — this check happens before the fetch, not
  // after, and the moderation Server Actions independently re-verify admin
  // status regardless of what a client sends.
  // EPIC: Yönetim Panelinde Statü Grupları — four independent lists now,
  // one per category, instead of the old "reviewed" (approved+rejected
  // combined).
  const [pending, approved, archived, rejected] = authorized
    ? await Promise.all([
        messageRepository.listPending(),
        messageRepository.listApproved(),
        messageRepository.listArchived(),
        messageRepository.listRejected(),
      ])
    : [[], [], [], []];

  // EPIC 014: resolve moderator display names for the "Moderated at" line —
  // one batched lookup across all four lists, the same
  // getByIds/getTile-batching pattern used everywhere else a set of user
  // ids needs names (e.g. board authors). moderatedBy is an internal admin
  // id, never rendered directly.
  const moderatorIds = Array.from(
    new Set(
      [...pending, ...approved, ...archived, ...rejected]
        .map((message) => message.moderatedBy)
        .filter((id): id is string => id !== null)
    )
  );
  const moderators = moderatorIds.length > 0 ? await userRepository.getByIds(moderatorIds) : [];
  const moderatorNameById = Object.fromEntries(
    moderators.map((moderator) => [moderator.id, moderator.name ?? moderator.email])
  );

  return (
    <ModerationPageContent
      authorized={authorized}
      pending={pending}
      approved={approved}
      archived={archived}
      rejected={rejected}
      moderatorNameById={moderatorNameById}
    />
  );
}
