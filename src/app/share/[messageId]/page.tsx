import { auth } from "@/features/auth/auth";
import { getPublicMessageById, isMessageAuthorBlockedBy } from "@/features/board/repository";
import { BlockedNoteNotice } from "@/features/blocks/components/BlockedNoteNotice";
import { getAppUrl, getRequestOrigin } from "@/lib/env";
import { SharePageContent } from "./_components/SharePageContent";

// Depends on runtime DB state — never prerendered.
export const dynamic = "force-dynamic";

export default async function SharePage({ params }: PageProps<"/share/[messageId]">) {
  const { messageId } = await params;
  const [session, message] = await Promise.all([auth(), getPublicMessageById(messageId)]);
  // User blocking: a note by someone the viewer blocked isn't shown via a
  // direct link either (the public share-card image itself stays public).
  if (session?.user?.id && message && (await isMessageAuthorBlockedBy(messageId, session.user.id))) {
    return <BlockedNoteNotice />;
  }
  // Facebook's sharer.php dialog (SocialShareActions.tsx) needs this
  // page's own real, absolute URL — it reads that page's Open Graph tags
  // (opengraph-image.tsx, sibling to this file) rather than accepting an
  // image directly. EPIC 025: this must reflect whichever host actually
  // served THIS request (localhost, a LAN IP during phone testing, or the
  // production domain) — never a statically configured value, since a
  // visitor reached this exact page instance via that exact host.
  // `getAppUrl()` is only the fallback for the rare case no host header is
  // present at all (matches `getAppUrl()`'s own "never silently generate a
  // wrong URL" discipline).
  const origin = (await getRequestOrigin()) ?? getAppUrl();
  const pageUrl = new URL(`/share/${messageId}`, origin).toString();

  return <SharePageContent messageId={messageId} message={message} pageUrl={pageUrl} />;
}
