"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { PageContainer } from "@/components/layout/PageContainer";
import type { PublicMessageDetail } from "@/features/board/types";
import { SHOPPIER_PRODUCT_URL } from "@/features/memories/config/shoppier";
import { Note } from "@/features/notes/components/Note";
import type { NoteData } from "@/features/notes/types";
import { ShareCardPicker } from "@/features/sharing/components/ShareCardPicker";
import { SocialShareActions } from "@/features/sharing/components/SocialShareActions";
import { shareFormats } from "@/features/sharing/config/shareFormats";
import { noteShareImageUrl } from "@/features/sharing/lib/shareImageUrl";
import { claimFirstShareReward } from "@/features/tokens/reward-actions";
import { useLocale } from "@/i18n/LocaleProvider";

interface SharePageContentProps {
  messageId: string;
  message: PublicMessageDetail | null;
  pageUrl: string;
  /** Whether the viewer is signed in — only gates calling the reward action, which re-reads the session itself. */
  signedIn: boolean;
  /** For the offer's label only — the reward action decides what is credited. */
  firstShareRewardAmount: number;
  /** Whether to offer the reward — false once this account has it. Display only, like the amount. */
  firstShareRewardAvailable: boolean;
}

export function SharePageContent({
  messageId,
  message,
  pageUrl,
  signedIn,
  firstShareRewardAmount,
  firstShareRewardAvailable,
}: SharePageContentProps) {
  const { dictionary } = useLocale();
  // EPIC 017: lifted out of ShareCardPicker (which otherwise owns this
  // internally) specifically so SocialShareActions can share the exact
  // format the user is currently previewing — previously hardcoded to
  // "square" regardless of what was selected below, a real preview/shared
  // output mismatch.
  const [shareFormatId, setShareFormatId] = useState(shareFormats[0].id);
  // First-share reward: claimed after a completed Web Share only (never a
  // download or platform fallback — the share components call onShared for
  // "shared" alone), at most once per page view; the server decides whether
  // anything is credited. The notice shows only for a "granted" result.
  const [rewardAmount, setRewardAmount] = useState<number | null>(null);
  // The offer stays until the server answers: granted (notice instead), or
  // already rewarded / not eligible (plain share button from then on). An
  // account that already has the reward isn't offered it in the first place.
  const [rewardOffered, setRewardOffered] = useState(signedIn && firstShareRewardAvailable);
  const rewardClaimedRef = useRef(false);
  function handleShared() {
    if (!signedIn || rewardClaimedRef.current) return;
    rewardClaimedRef.current = true;
    claimFirstShareReward()
      .then((result) => {
        if (result.status === "granted") {
          setRewardAmount(result.amount);
          setRewardOffered(false);
        } else if (result.status === "failed") {
          // A transient failure may be retried by the next completed share.
          rewardClaimedRef.current = false;
        } else {
          setRewardOffered(false);
        }
      })
      .catch(() => {
        rewardClaimedRef.current = false;
      });
  }

  if (!message) {
    return (
      <div className="flex min-h-page-panel items-center justify-center py-16">
        <PageContainer className="mx-auto flex max-w-md flex-col items-center gap-3 text-center">
          <h1 className="font-display text-2xl font-medium text-navy">{dictionary.memory.notEligibleTitle}</h1>
          {/* min-w-0: a flex item's default `min-width: auto` overrides its
              own `max-width`/wrapping under a `align-items: center` parent
              (every `flex flex-col items-center` block in this file has
              this same risk) — without it, this text refuses to wrap and
              silently widens the whole page horizontally on a narrow
              viewport instead (confirmed: a real, reproducible ~390px
              regression, isolated down to exactly this CSS pattern). */}
          <p className="min-w-0 text-ink-soft">{dictionary.memory.notEligibleBody}</p>
        </PageContainer>
      </div>
    );
  }

  const previewNote: NoteData = {
    id: message.id,
    content: message.content,
    authorName: message.author?.displayName ?? "",
    authorImage: message.author?.image ?? null,
    templateId: message.templateId,
    fontFamily: message.fontFamily,
    size: "md",
    rotation: 0,
    position: { top: "0%", left: "0%" },
    language: message.language,
  };

  const imageEndpoint = (formatId: string) => noteShareImageUrl(messageId, formatId);

  return (
    <PageContainer className="flex flex-col items-center gap-8 py-16">
      {/* w-full max-w-md (not just min-w-0 on the <p> below): this div is
          itself a flex item of PageContainer's `items-center`, so without
          an actual width it also shrinks-to-fit horizontally — giving its
          own children no real containing-block width to wrap text
          against, no matter what the <p> itself is set to. Confirmed by
          testing: fixing only the <p> had zero effect until this
          ancestor also stopped being shrink-to-fit. */}
      <div className="flex w-full max-w-md flex-col items-center gap-2 text-center">
        <h1 className="font-display text-2xl font-medium text-navy">{dictionary.share.pageTitle}</h1>
        <p className="text-sm text-ink-soft">{dictionary.share.pageSubtitle}</p>
      </div>

      <Note note={previewNote} variant="static" />

      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-navy">{dictionary.share.scopeLabel}</span>
          {/* The image share is always the note on its own (note_only) —
              a fixed label, not a choice. */}
          <div className="flex flex-wrap gap-2">
            <span className="rounded-pill border border-orange bg-orange px-3 py-1.5 text-xs font-medium text-navy">
              {dictionary.memory.captureNoteOnly}
            </span>
          </div>
        </div>

        {/* FREE: social share — a branded PNG anyone can generate, no sign-in, no cost. */}
        <div className="flex flex-col gap-4">
          <span className="text-sm font-medium text-navy">{dictionary.share.socialHeading}</span>
          <ShareCardPicker
            imageEndpoint={imageEndpoint}
            fileNamePrefix="mindot-note"
            formatId={shareFormatId}
            onFormatChange={setShareFormatId}
            onShared={handleShared}
            shareButtonLabel={
              rewardOffered ? dictionary.share.shareAndEarnButton.replace("{count}", String(firstShareRewardAmount)) : undefined
            }
            shareHint={rewardOffered ? dictionary.share.firstShareRewardHint : undefined}
          />
          <p
            role="status"
            aria-live="polite"
            className="rounded-md bg-orange/10 px-3 py-2 text-center text-sm font-medium text-navy empty:hidden"
          >
            {rewardAmount !== null ? dictionary.share.firstShareReward.replace("{count}", String(rewardAmount)) : null}
          </p>
          <SocialShareActions
            pageUrl={pageUrl}
            imageUrl={() => imageEndpoint(shareFormatId)}
            fileNamePrefix="mindot-note"
            formatId={shareFormatId}
            onShared={handleShared}
          />
        </div>

        {/* COMMERCIAL: a link out to the paid Digital Frame product only —
            no PDF/print CTA and no access-code entry UI on this free share
            page. Redeeming a code still only ever happens on the
            already-working /memory/[messageId] flow, never re-implemented
            here. */}
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-canvas p-5 text-center">
          {SHOPPIER_PRODUCT_URL ? (
            <a
              href={SHOPPIER_PRODUCT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-orange-ink hover:underline"
            >
              {dictionary.memory.shoppierButton}
            </a>
          ) : (
            <p className="text-xs text-orange-ink">{dictionary.memory.shoppierUnavailable}</p>
          )}
        </div>
      </div>

      <Link href="/board" className="text-sm font-medium text-ink-soft hover:text-navy">
        {dictionary.states.board}
      </Link>
    </PageContainer>
  );
}
