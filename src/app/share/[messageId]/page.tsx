import { getPublicMessageById } from "@/features/board/repository";
import { SharePageContent } from "./_components/SharePageContent";

// Depends on runtime DB state — never prerendered.
export const dynamic = "force-dynamic";

export default async function SharePage({ params }: PageProps<"/share/[messageId]">) {
  const { messageId } = await params;
  const message = await getPublicMessageById(messageId);

  return <SharePageContent messageId={messageId} message={message} />;
}
