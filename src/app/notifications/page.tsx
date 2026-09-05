import { auth } from "@/features/auth/auth";
import { notificationRepository } from "@/features/notifications/repository";
import { NotificationsPageContent } from "./_components/NotificationsPageContent";

// Notifications change at runtime (moderation/report actions elsewhere) —
// this must never be frozen into a build-time static prerender, same
// reasoning as /board and /me/archive.
export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

function parsePage(raw: string | undefined): number {
  const parsed = Number.parseInt(raw ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

/**
 * Authenticated-only full notification history — mirrors /me/archive's own
 * shape exactly: the Server Component resolves the session and does the
 * one recipient-scoped repository read, then hands the result to a Client
 * Component for the interactive parts (mark as read, mark all as read).
 * Unauthenticated visitors get the same "sign-in-required" content
 * treatment ArchivePageContent already established, not a redirect.
 */
export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    return <NotificationsPageContent isSignedIn={false} items={[]} page={1} totalPages={1} unreadCount={0} />;
  }

  const sp = await searchParams;
  const requestedPage = parsePage(sp.page);

  const [firstAttempt, unreadCount] = await Promise.all([
    notificationRepository.listForUser(session.user.id, {
      limit: PAGE_SIZE,
      offset: (requestedPage - 1) * PAGE_SIZE,
    }),
    notificationRepository.countUnreadForUser(session.user.id),
  ]);

  const totalPages = Math.max(1, Math.ceil(firstAttempt.total / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);

  // A deep-linked/stale page number past the real last page (e.g. items
  // were read elsewhere, shrinking nothing here but a manually-edited URL
  // could still overshoot) is clamped and re-fetched rather than shown as a
  // confusing empty page with a mismatched page number.
  const notificationPage = page === requestedPage ? firstAttempt : await notificationRepository.listForUser(session.user.id, {
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });

  return (
    <NotificationsPageContent
      isSignedIn
      items={notificationPage.items}
      page={page}
      totalPages={totalPages}
      unreadCount={unreadCount}
    />
  );
}
