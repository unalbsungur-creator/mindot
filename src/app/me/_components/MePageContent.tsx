"use client";

import { useState } from "react";
import Link from "next/link";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { BrandMark } from "@/components/brand/BrandMark";
import { PageContainer } from "@/components/layout/PageContainer";
import type { PersonalWallNote } from "@/features/profile/types";
import { CopyLinkButton } from "@/features/profile/components/CopyLinkButton";
import { WallNotes } from "@/features/profile/components/WallNotes";
import { ShareCardPicker } from "@/features/sharing/components/ShareCardPicker";
import { useLocale } from "@/i18n/LocaleProvider";
import { WallSettings } from "./WallSettings";

interface MeData {
  displayName: string;
  image: string | null;
  publicId: string;
  wallNotes: PersonalWallNote[];
  thoughtsCount: number;
  memoriesCount: number;
  digitalCount: number;
  physicalCount: number;
  publicWallEnabled: boolean;
  publicWallDescription: string | null;
  totalWrittenCount: number;
  publishedCount: number;
  pendingCount: number;
}

interface MePageContentProps {
  isSignedIn: boolean;
  data: MeData | null;
}

export function MePageContent({ isSignedIn, data }: MePageContentProps) {
  const { dictionary } = useLocale();
  // Lifted here (not just inside WallSettings) so the "Share my wall"
  // section below reacts immediately when the toggle changes, without a
  // full page reload — WallSettings still owns persisting the change.
  const [wallEnabled, setWallEnabled] = useState(data?.publicWallEnabled ?? false);

  if (!isSignedIn || !data) {
    return (
      <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center py-16">
        <PageContainer className="mx-auto flex max-w-md flex-col items-center gap-6 text-center">
          <BrandMark className="h-10" />
          <h1 className="font-display text-2xl font-medium text-navy">{dictionary.profile.pageTitle}</h1>
          <p className="text-ink-soft">{dictionary.profile.subtitle}</p>
          <GoogleSignInButton redirectTo="/me" />
        </PageContainer>
      </div>
    );
  }

  const publicPath = `/u/${data.publicId}`;
  const stats = [
    `${data.thoughtsCount} ${dictionary.profile.thoughtsLabel}`,
    `${data.memoriesCount} ${dictionary.profile.memoriesLabel}`,
    `${data.digitalCount} ${dictionary.profile.digitalLabel}`,
    `${data.physicalCount} ${dictionary.profile.physicalLabel}`,
  ];
  const activitySummary = [
    { count: data.totalWrittenCount, label: dictionary.profile.totalWrittenLabel },
    { count: data.publishedCount, label: dictionary.archive.statePublished },
    { count: data.pendingCount, label: dictionary.archive.statePending },
  ];

  return (
    <PageContainer className="mx-auto flex max-w-3xl flex-col gap-10 py-16">
      <div className="flex flex-col items-center gap-4 text-center">
        {data.image ? (
          // eslint-disable-next-line @next/next/no-img-element -- small decorative avatar from an arbitrary Google profile URL
          <img
            src={data.image}
            alt=""
            referrerPolicy="no-referrer"
            className="h-16 w-16 rounded-full border-2 border-surface object-cover shadow-card"
          />
        ) : (
          <BrandMark className="h-12" />
        )}
        <h1 className="font-display text-2xl font-medium text-navy sm:text-3xl">{data.displayName}</h1>
        <p className="max-w-md text-sm text-ink-soft">{dictionary.profile.subtitle}</p>
        {/* MINDOT's own slogan, used sparingly — this is the one place it accents a signed-in user's personal space. */}
        <p className="text-xs font-medium uppercase tracking-wide text-orange-ink">{dictionary.boardPage.slogan}</p>
        <p className="text-xs text-ink-soft">{stats.join(" · ")}</p>
      </div>

      <nav aria-label={dictionary.profile.pageTitle} className="flex flex-wrap items-center justify-center gap-4 text-sm font-medium text-ink-soft">
        <Link href="/me/archive" className="hover:text-navy">
          {dictionary.profile.archiveLinkLabel}
        </Link>
        <Link href="/me/memories" className="hover:text-navy">
          {dictionary.profile.memoriesLinkLabel}
        </Link>
        <SignOutButton redirectTo="/" />
      </nav>

      <section aria-label={dictionary.profile.totalWrittenLabel} className="flex justify-center gap-8">
        {activitySummary.map((item) => (
          <div key={item.label} className="flex flex-col items-center gap-0.5">
            <span className="font-display text-xl font-medium text-navy">{item.count}</span>
            <span className="text-xs text-ink-soft">{item.label}</span>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-4">
        <WallSettings
          initialEnabled={data.publicWallEnabled}
          initialDescription={data.publicWallDescription}
          onEnabledChange={setWallEnabled}
        />

        <div className="flex flex-wrap items-center justify-center gap-2 text-center">
          <span className="text-sm text-ink-soft">{dictionary.profile.publicWallLabel}:</span>
          <Link href={publicPath} className="text-sm font-medium text-navy hover:underline">
            {publicPath}
          </Link>
          <CopyLinkButton path={publicPath} />
        </div>

        <WallNotes
          notes={data.wallNotes}
          profile={{ displayName: data.displayName, image: data.image }}
          emptyMessage={dictionary.profile.wallEmptyMessage}
        />

        {data.wallNotes.length > 0 &&
          (wallEnabled ? (
            <div className="mx-auto flex w-full max-w-sm flex-col gap-2">
              <span className="text-center text-sm font-medium text-navy">{dictionary.publicWall.shareWallButton}</span>
              <ShareCardPicker
                imageEndpoint={(formatId) => `/api/share/wall/${data.publicId}/${formatId}`}
                fileNamePrefix="mindot-wall"
              />
            </div>
          ) : (
            <p className="text-center text-sm text-ink-soft">{dictionary.profile.shareWallDisabledHint}</p>
          ))}
      </section>
    </PageContainer>
  );
}
