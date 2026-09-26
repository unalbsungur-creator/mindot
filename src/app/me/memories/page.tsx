import { auth } from "@/features/auth/auth";
import { getMemoryLibrary } from "@/features/profile/repository";
import { tokenRepository } from "@/features/tokens/repository";
import { MemoryLibraryContent } from "./_components/MemoryLibraryContent";

export const dynamic = "force-dynamic";

export default async function MemoriesPage() {
  const session = await auth();
  if (!session?.user?.id) {
    return <MemoryLibraryContent isSignedIn={false} items={[]} tokenBalance={0} />;
  }

  const [items, tokenBalance] = await Promise.all([
    getMemoryLibrary(session.user.id),
    tokenRepository.getBalance(session.user.id),
  ]);
  return <MemoryLibraryContent isSignedIn items={items} tokenBalance={tokenBalance} />;
}
