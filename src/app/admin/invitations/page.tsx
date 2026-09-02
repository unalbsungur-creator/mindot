import { auth } from "@/features/auth/auth";
import { invitationRepository } from "@/features/invitations/repository";
import { InvitationsPageContent } from "./_components/InvitationsPageContent";

export default async function AdminInvitationsPage() {
  const session = await auth();
  const authorized = session?.user?.role === "admin";

  // Same posture as /admin/moderation: unauthorized visitors never
  // receive invitation data in the rendered payload at all.
  const invitations = authorized ? await invitationRepository.list() : [];

  return <InvitationsPageContent authorized={authorized} invitations={invitations} />;
}
