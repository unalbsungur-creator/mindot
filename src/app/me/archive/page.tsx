import { auth } from "@/features/auth/auth";
import { getPrivateArchive } from "@/features/profile/repository";
import { parseTimeRangeParams } from "@/features/profile/lib/timeRange";
import { ArchivePageContent } from "./_components/ArchivePageContent";

export const dynamic = "force-dynamic";

export default async function ArchivePage({ searchParams }: PageProps<"/me/archive">) {
  const session = await auth();
  if (!session?.user?.id) {
    return <ArchivePageContent isSignedIn={false} messages={[]} />;
  }

  const sp = await searchParams;
  const range = parseTimeRangeParams(sp);
  const messages = await getPrivateArchive(session.user.id, range);

  return <ArchivePageContent isSignedIn messages={messages} />;
}
