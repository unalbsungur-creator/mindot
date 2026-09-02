import { auth } from "@/features/auth/auth";
import { WritePageContent } from "./_components/WritePageContent";

export default async function WritePage() {
  const session = await auth();

  return (
    <WritePageContent
      sessionUser={
        session?.user
          ? { name: session.user.name ?? null, email: session.user.email ?? null, image: session.user.image ?? null }
          : null
      }
    />
  );
}
