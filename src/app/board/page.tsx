import { auth } from "@/features/auth/auth";
import { getTile } from "@/features/board/repository";
import { resolveBoardCenterPoint } from "@/features/board/lib/worldGeometry";
import { BoardPageContent } from "./_components/BoardPageContent";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Explore the wall",
  description: "Explore approved thoughts across the living MINDOT wall.",
  alternates: { canonical: "/board" },
  openGraph: { title: "Explore the MINDOT wall", url: "/board" },
  twitter: { card: "summary_large_image" },
};

// Approved messages change at runtime (moderation, future tile navigation)
// — this must never be frozen into a build-time static prerender.
export const dynamic = "force-dynamic";

export default async function BoardPage() {
  // A signed-in viewer's initial tile already excludes authors they've
  // blocked; every later tile comes from the matching private endpoint.
  const session = await auth();
  const viewerId = session?.user?.id;
  const initialTile = await getTile(0, 0, undefined, viewerId);
  // EPIC: Approved Message Management — resolved server-side from the
  // same tile fetch, no extra query. See resolveBoardCenterPoint's own
  // doc comment for the fallback behavior if the reference message is
  // ever archived/missing.
  const centerPoint = resolveBoardCenterPoint(initialTile.messages.map((message) => message.id));
  return <BoardPageContent initialTile={initialTile} centerPoint={centerPoint} viewerSignedIn={Boolean(viewerId)} />;
}
