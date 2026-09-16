import { requireAdmin } from "@/features/auth/requireAdmin";
import { invitationRepository } from "@/features/invitations/repository";
import { InvitationsPageContent } from "./_components/InvitationsPageContent";

export default async function AdminInvitationsPage() {
  const adminUser = await requireAdmin();
  const authorized = adminUser !== null;

  // Same posture as /admin/moderation: unauthorized visitors never
  // receive invitation data in the rendered payload at all.
  const invitations = authorized ? await invitationRepository.list() : [];

  return <InvitationsPageContent authorized={authorized} invitations={invitations} />;
}
