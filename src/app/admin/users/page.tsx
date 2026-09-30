import { requireAdmin } from "@/features/auth/requireAdmin";
import { messageRepository } from "@/features/messages/repository";
import { tokenRepository } from "@/features/tokens/repository";
import { userRepository } from "@/features/users/repository";
import { UsersPageContent } from "./_components/UsersPageContent";

export default async function UsersPage() {
  const adminUser = await requireAdmin();
  const authorized = adminUser !== null;

  // Same shape as every other admin page: unauthorized visitors never
  // receive any user data in the payload — the fetch happens only after
  // the check. suspendUser/unsuspendUser (features/users/moderation-actions.ts)
  // independently re-verify admin status regardless of what a client sends.
  const users = authorized ? await userRepository.listAll() : [];
  // One batched wallet read for the whole list; no wallet row means 0.
  const balances = await tokenRepository.getBalances(users.map((user) => user.id));
  const items = await Promise.all(
    users.map(async (user) => ({
      user,
      messageCounts: await messageRepository.countByAuthor(user.id),
      tokenBalance: balances.get(user.id) ?? 0,
    }))
  );

  return <UsersPageContent authorized={authorized} items={items} currentUserId={adminUser?.id ?? null} />;
}
