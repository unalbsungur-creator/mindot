import type { Metadata } from "next";
import { auth } from "@/features/auth/auth";
import { getPublicMessageById } from "@/features/board/repository";
import { digitalAccessCodeRepository, memoryRepository, physicalOrderRepository } from "@/features/memories/repository";
import { MemoryPageContent, type ExistingProjectView } from "./_components/MemoryPageContent";

// Depends on runtime DB state and per-user session — never prerendered.
export const dynamic = "force-dynamic";

const EXCERPT_MAX_CHARS = 120;

/**
 * Privacy-safe by construction: reads through the same
 * `getPublicMessageById` the page itself uses, so the description can
 * never include anything beyond what's already public — an anonymous
 * note's author never appears here either, same as everywhere else in the
 * public contract.
 */
export async function generateMetadata({ params }: PageProps<"/memory/[messageId]">): Promise<Metadata> {
  const { messageId } = await params;
  const message = await getPublicMessageById(messageId);
  if (!message) return { title: "MINDOT" };

  const excerpt = message.content.length > EXCERPT_MAX_CHARS ? `${message.content.slice(0, EXCERPT_MAX_CHARS)}…` : message.content;
  const description = message.author ? `${excerpt} — ${message.author.displayName}` : excerpt;

  return { title: "MINDOT", description };
}

export default async function MemoryPage({ params }: PageProps<"/memory/[messageId]">) {
  const { messageId } = await params;
  const [session, message] = await Promise.all([auth(), getPublicMessageById(messageId)]);

  let existingProjects: ExistingProjectView[] = [];
  if (session?.user?.id) {
    const mine = (await memoryRepository.listByCreator(session.user.id)).filter((p) => p.messageId === messageId);

    // Access/order state is re-derived from the database on every visit —
    // never trusted from client memory — so a user who redeemed a code
    // yesterday and comes back today sees "access granted" immediately,
    // with no code re-entry.
    existingProjects = await Promise.all(
      mine.map(async (project) => {
        if (project.outputType === "digital_frame") {
          const redeemed = await digitalAccessCodeRepository.getRedeemedForProject(project.id);
          return { project, accessGranted: redeemed !== null, physicalOrder: null };
        }
        if (project.outputType === "physical_gift") {
          const order = await physicalOrderRepository.getByMemoryProjectId(project.id);
          return { project, accessGranted: false, physicalOrder: order };
        }
        return { project, accessGranted: true, physicalOrder: null };
      })
    );
  }

  return (
    <MemoryPageContent
      messageId={messageId}
      message={message}
      isSignedIn={!!session?.user?.id}
      existingProjects={existingProjects}
    />
  );
}
