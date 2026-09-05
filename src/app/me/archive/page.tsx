import { auth } from "@/features/auth/auth";
import { getPrivateArchive } from "@/features/profile/repository";
import { parseTimeRangeParams } from "@/features/profile/lib/timeRange";
import { ArchivePageContent } from "./_components/ArchivePageContent";

export const dynamic = "force-dynamic";

// EPIC 024: the old flat ARCHIVE_LIMIT (60) is now the page size, not a
// ceiling — kept as the same number so anyone with 60 or fewer messages
// sees zero behavior change.
const PAGE_SIZE = 60;

function parsePage(raw: string | undefined): number {
  const parsed = Number.parseInt(raw ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export default async function ArchivePage({ searchParams }: PageProps<"/me/archive">) {
  const session = await auth();
  if (!session?.user?.id) {
    return <ArchivePageContent isSignedIn={false} messages={[]} page={1} totalPages={1} />;
  }

  const sp = await searchParams;
  const range = parseTimeRangeParams(sp);
  const requestedPage = parsePage(typeof sp.page === "string" ? sp.page : undefined);

  const firstAttempt = await getPrivateArchive(session.user.id, range, {
    limit: PAGE_SIZE,
    offset: (requestedPage - 1) * PAGE_SIZE,
  });
  const totalPages = Math.max(1, Math.ceil(firstAttempt.total / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);

  // Same "clamp a deep-linked/stale page number, re-fetch rather than show
  // a confusing empty page" convention /notifications already established.
  const archive =
    page === requestedPage
      ? firstAttempt
      : await getPrivateArchive(session.user.id, range, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });

  return <ArchivePageContent isSignedIn messages={archive.items} page={page} totalPages={totalPages} />;
}
