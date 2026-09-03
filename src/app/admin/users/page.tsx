import { auth } from "@/features/auth/auth";
import { messageRepository } from "@/features/messages/repository";
import { userRepository } from "@/features/users/repository";
import { UsersPageContent } from "./_components/UsersPageContent";

export default async function UsersPage() {
  const session = await auth();
  const authorized = session?.user?.role === "admin";

  // Same shape as every other admin page: unauthorized visitors never
  // receive any user data in the payload — the fetch happens only after
  // the check. suspendUser/unsuspendUser (features/users/moderation-actions.ts)
  // independently re-verify admin status regardless of what a client sends.
  const items = authorized
    ? await Promise.all(
        (await userRepository.listAll()).map(async (user) => ({
          user,
          messageCounts: await messageRepository.countByAuthor(user.id),
        }))
      )
    : [];

  return <UsersPageContent authorized={authorized} items={items} currentUserId={session?.user?.id ?? null} />;
}
