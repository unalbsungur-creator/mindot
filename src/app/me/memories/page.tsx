import { auth } from "@/features/auth/auth";
import { getMemoryLibrary } from "@/features/profile/repository";
import { MemoryLibraryContent } from "./_components/MemoryLibraryContent";

export const dynamic = "force-dynamic";

export default async function MemoriesPage() {
  const session = await auth();
  if (!session?.user?.id) {
    return <MemoryLibraryContent isSignedIn={false} items={[]} />;
  }

  const items = await getMemoryLibrary(session.user.id);
  return <MemoryLibraryContent isSignedIn items={items} />;
}
