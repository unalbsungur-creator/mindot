"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { BrandMark } from "@/components/brand/BrandMark";
import { PageContainer } from "@/components/layout/PageContainer";
import { BlockUserButton } from "@/features/blocks/components/BlockUserButton";
import type { PublicWallResult } from "@/features/profile/types";
import { WallNotes } from "@/features/profile/components/WallNotes";
import { ShareCardPicker } from "@/features/sharing/components/ShareCardPicker";
import { useLocale } from "@/i18n/LocaleProvider";

interface PublicWallContentProps {
  publicId: string;
  wall: PublicWallResult;
  page: number;
  totalPages: number;
  /** A signed-in visitor who isn't this wall's owner — the only one offered Block. */
  canBlock: boolean;
}

/** EPIC 024: same param-preserving link builder ArchivePageContent uses — keeps any existing `from`/`to` intact, only touches `page`. */
function pageHref(pathname: string, searchParams: URLSearchParams, page: number): string {
  const next = new URLSearchParams(searchParams);
  if (page <= 1) next.delete("page");
  else next.set("page", String(page));
  const qs = next.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

/** Shared skeleton for the "nothing to show" states below — same layout, different copy. */
function WallMessagePanel({ title, body, image, children }: { title: string; body: string; image?: string | null; children?: ReactNode }) {
  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center py-16">
      <PageContainer className="mx-auto flex max-w-md flex-col items-center gap-3 text-center">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element -- small decorative avatar from an arbitrary Google profile URL
          <img src={image} alt="" referrerPolicy="no-referrer" className="h-16 w-16 rounded-full border-2 border-surface object-cover shadow-card" />
        ) : (
          <BrandMark className="h-10" />
        )}
        <h1 className="font-display text-2xl font-medium text-navy">{title}</h1>
        <p className="text-ink-soft">{body}</p>
        {children}
      </PageContainer>
    </div>
  );
}

export function PublicWallContent({ publicId, wall, page, totalPages, canBlock }: PublicWallContentProps) {
  const { dictionary } = useLocale();
  const searchParams = useSearchParams();

  if (wall.status === "not-found") {
    return <WallMessagePanel title={dictionary.publicWall.notFoundTitle} body={dictionary.publicWall.notFoundBody} />;
  }

  // User blocking: the owner's notes were never fetched (see getPublicWall);
  // only the way back — unblocking — is offered.
  if (wall.status === "blocked") {
    return (
      <WallMessagePanel title={dictionary.blocking.blockedWallTitle} body={dictionary.blocking.blockedWallBody} image={wall.profile.image}>
        <BlockUserButton publicId={publicId} displayName={wall.profile.displayName} blocked />
      </WallMessagePanel>
    );
  }

  if (wall.status === "disabled") {
    return (
      <WallMessagePanel
        title={dictionary.publicWall.disabledTitle}
        body={dictionary.publicWall.disabledBody}
        image={wall.profile.image}
      >
        {canBlock && <BlockUserButton publicId={publicId} displayName={wall.profile.displayName} blocked={false} />}
      </WallMessagePanel>
    );
  }

  return (
    <PageContainer className="mx-auto flex max-w-3xl flex-col gap-8 py-16">
      <div className="flex flex-col items-center gap-3 text-center">
        {wall.profile.image ? (
          // eslint-disable-next-line @next/next/no-img-element -- small decorative avatar from an arbitrary Google profile URL
          <img
            src={wall.profile.image}
            alt=""
            referrerPolicy="no-referrer"
            className="h-16 w-16 rounded-full border-2 border-surface object-cover shadow-card"
          />
        ) : (
          <BrandMark className="h-12" />
        )}
        <h1 className="font-display text-2xl font-medium text-navy sm:text-3xl">{wall.profile.displayName}</h1>
        {wall.description && <p className="max-w-md text-sm text-ink-soft">{wall.description}</p>}
        {canBlock && <BlockUserButton publicId={publicId} displayName={wall.profile.displayName} blocked={false} />}
      </div>

      <WallNotes notes={wall.notes} profile={wall.profile} emptyMessage={dictionary.publicWall.emptyMessage} />

      {/* EPIC 024: same generic notifications.pagination* reuse as ArchivePageContent — see its own comment for why. */}
      {totalPages > 1 && (
        <nav aria-label={wall.profile.displayName} className="flex items-center justify-between gap-4 text-sm">
          {page > 1 ? (
            <Link href={pageHref(`/u/${publicId}`, searchParams, page - 1)} className="font-medium text-navy hover:text-orange">
              {dictionary.notifications.paginationPrev}
            </Link>
          ) : (
            <span aria-hidden="true" />
          )}
          <span className="text-ink-soft">
            {dictionary.notifications.paginationLabel.replace("{page}", String(page)).replace("{total}", String(totalPages))}
          </span>
          {page < totalPages ? (
            <Link href={pageHref(`/u/${publicId}`, searchParams, page + 1)} className="font-medium text-navy hover:text-orange">
              {dictionary.notifications.paginationNext}
            </Link>
          ) : (
            <span aria-hidden="true" />
          )}
        </nav>
      )}

      {wall.notes.length > 0 && (
        <div className="mx-auto flex w-full max-w-sm flex-col gap-2">
          <span className="text-center text-sm font-medium text-navy">{dictionary.publicWall.shareWallButton}</span>
          <ShareCardPicker imageEndpoint={(formatId) => `/api/share/wall/${publicId}/${formatId}`} fileNamePrefix="mindot-wall" />
        </div>
      )}
    </PageContainer>
  );
}
