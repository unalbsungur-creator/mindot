import { auth } from "@/features/auth/auth";
import { messageRepository } from "@/features/messages/repository";
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

  return (
    <ModerationPageContent
      authorized={authorized}
      pending={pending}
      approved={approved}
      archived={archived}
      rejected={rejected}
    />
  );
}
