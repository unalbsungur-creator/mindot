import { getPublicMessageById } from "@/features/board/repository";
import { getAppUrl } from "@/lib/env";
import { SharePageContent } from "./_components/SharePageContent";

// Depends on runtime DB state — never prerendered.
export const dynamic = "force-dynamic";

export default async function SharePage({ params }: PageProps<"/share/[messageId]">) {
  const { messageId } = await params;
  const message = await getPublicMessageById(messageId);
  // Facebook's sharer.php dialog (SocialShareActions.tsx) needs this
  // page's own real, absolute URL — it reads that page's Open Graph tags
  // (opengraph-image.tsx, sibling to this file) rather than accepting an
  // image directly.
  const pageUrl = new URL(`/share/${messageId}`, getAppUrl()).toString();

  return <SharePageContent messageId={messageId} message={message} pageUrl={pageUrl} />;
}
