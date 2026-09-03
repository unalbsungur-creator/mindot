import { auth } from "@/features/auth/auth";
import { userRepository } from "@/features/users/repository";
import { WritePageContent } from "./_components/WritePageContent";

export default async function WritePage() {
  const session = await auth();
  // EPIC 013: a fresh DB read, not JWT-embedded state — see submitMessage's
  // own comment for why suspension must never lag behind an existing session.
  const author = session?.user?.id ? await userRepository.getById(session.user.id) : null;

  return (
    <WritePageContent
      sessionUser={
        session?.user
          ? { name: session.user.name ?? null, email: session.user.email ?? null, image: session.user.image ?? null }
          : null
      }
      isSuspended={author?.status === "suspended"}
    />
  );
}
