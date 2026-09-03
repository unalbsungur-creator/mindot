import { auth } from "@/features/auth/auth";
import { invitationRepository } from "@/features/invitations/repository";
import { getEffectiveStatus } from "@/features/invitations/types";
import { userRepository } from "@/features/users/repository";
import { InvitePageContent } from "@/features/invitations/components/InvitePageContent";

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;

  const [session, invitation] = await Promise.all([auth(), invitationRepository.getByToken(token)]);
  // EPIC 013: same fresh-DB-read reasoning as /write's page — see there.
  const author = session?.user?.id ? await userRepository.getById(session.user.id) : null;

  return (
    <InvitePageContent
      token={token}
      status={invitation ? getEffectiveStatus(invitation) : null}
      sessionUser={
        session?.user
          ? { name: session.user.name ?? null, email: session.user.email ?? null, image: session.user.image ?? null }
          : null
      }
      isSuspended={author?.status === "suspended"}
    />
  );
}
