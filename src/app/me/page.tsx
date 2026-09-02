import { auth } from "@/features/auth/auth";
import { memoryRepository, physicalOrderRepository } from "@/features/memories/repository";
import { messageRepository } from "@/features/messages/repository";
import { getPersonalWallByUserId } from "@/features/profile/repository";
import { userRepository } from "@/features/users/repository";
import { MePageContent } from "./_components/MePageContent";

// Per-session, DB-dependent — never prerendered.
export const dynamic = "force-dynamic";

export default async function MePage() {
  const session = await auth();
  if (!session?.user?.id) {
    return <MePageContent isSignedIn={false} data={null} />;
  }

  const userId = session.user.id;
  const [publicId, wallNotes, memoryProjects, physicalOrders] = await Promise.all([
    userRepository.ensurePublicId(userId),
    getPersonalWallByUserId(userId),
    memoryRepository.listByCreator(userId),
    physicalOrderRepository.listByCreator(userId),
  ]);

  // Sequential, not folded into the Promise.all above: two more
  // independent single-user reads (a row lookup, an aggregate count) —
  // negligible latency difference, and keeping new additions sequential
  // avoids introducing more connection-pool parallelism than the existing
  // stable pattern here already uses (see getPrivateArchive/getMemoryLibrary
  // in features/profile/repository.ts for the same reasoning).
  const user = await userRepository.getById(userId);
  const counts = await messageRepository.countByAuthor(userId);

  return (
    <MePageContent
      isSignedIn
      data={{
        displayName: session.user.name ?? "MINDOT",
        image: session.user.image ?? null,
        publicId,
        wallNotes,
        thoughtsCount: wallNotes.length,
        memoriesCount: memoryProjects.length,
        digitalCount: memoryProjects.filter((project) => project.outputType === "digital_frame").length,
        physicalCount: physicalOrders.length,
        publicWallEnabled: user?.publicWallEnabled ?? false,
        publicWallDescription: user?.publicWallDescription ?? null,
        totalWrittenCount: counts.total,
        publishedCount: counts.approved,
        pendingCount: counts.pending,
      }}
    />
  );
}
