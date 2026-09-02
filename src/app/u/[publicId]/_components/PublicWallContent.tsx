"use client";

import { BrandMark } from "@/components/brand/BrandMark";
import { PageContainer } from "@/components/layout/PageContainer";
import type { PublicWallResult } from "@/features/profile/types";
import { WallNotes } from "@/features/profile/components/WallNotes";
import { ShareCardPicker } from "@/features/sharing/components/ShareCardPicker";
import { useLocale } from "@/i18n/LocaleProvider";

interface PublicWallContentProps {
  publicId: string;
  wall: PublicWallResult;
}

/** Shared skeleton for the two "nothing to show" states below — same layout, different copy. */
function WallMessagePanel({ title, body, image }: { title: string; body: string; image?: string | null }) {
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
      </PageContainer>
    </div>
  );
}

export function PublicWallContent({ publicId, wall }: PublicWallContentProps) {
  const { dictionary } = useLocale();

  if (wall.status === "not-found") {
    return <WallMessagePanel title={dictionary.publicWall.notFoundTitle} body={dictionary.publicWall.notFoundBody} />;
  }

  if (wall.status === "disabled") {
    return (
      <WallMessagePanel
        title={dictionary.publicWall.disabledTitle}
        body={dictionary.publicWall.disabledBody}
        image={wall.profile.image}
      />
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
      </div>

      <WallNotes notes={wall.notes} profile={wall.profile} emptyMessage={dictionary.publicWall.emptyMessage} />

      {wall.notes.length > 0 && (
        <div className="mx-auto flex w-full max-w-sm flex-col gap-2">
          <span className="text-center text-sm font-medium text-navy">{dictionary.publicWall.shareWallButton}</span>
          <ShareCardPicker imageEndpoint={(formatId) => `/api/share/wall/${publicId}/${formatId}`} fileNamePrefix="mindot-wall" />
        </div>
      )}
    </PageContainer>
  );
}
