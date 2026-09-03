"use client";

import { useState } from "react";
import Link from "next/link";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/Button";
import type { PublicMessageDetail } from "@/features/board/types";
import { SHOPPIER_PRODUCT_URL } from "@/features/memories/config/shoppier";
import type { MemoryCaptureMode } from "@/features/memories/types";
import { Note } from "@/features/notes/components/Note";
import type { NoteData } from "@/features/notes/types";
import { ShareCardPicker } from "@/features/sharing/components/ShareCardPicker";
import { SocialShareActions } from "@/features/sharing/components/SocialShareActions";
import { useLocale } from "@/i18n/LocaleProvider";
import { cn } from "@/lib/cn";

interface SharePageContentProps {
  messageId: string;
  message: PublicMessageDetail | null;
  pageUrl: string;
}

const scopeButtonClasses = (active: boolean) =>
  cn(
    "rounded-pill border px-3 py-1.5 text-xs font-medium transition-colors",
    active ? "border-orange bg-orange text-navy" : "border-border text-ink-soft hover:text-navy"
  );

export function SharePageContent({ messageId, message, pageUrl }: SharePageContentProps) {
  const { dictionary } = useLocale();
  const [captureMode, setCaptureMode] = useState<MemoryCaptureMode>("note_only");

  if (!message) {
    return (
      <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center py-16">
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
    size: "md",
    rotation: 0,
    position: { top: "0%", left: "0%" },
    language: message.language,
  };

  const imageEndpoint = (formatId: string) => `/api/share/note/${messageId}/${formatId}?mode=${captureMode}`;

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
          {/* flex-wrap: "Düşünce + çevresindeki duvar" is long enough
              that, combined with the first button, it can exceed a narrow
              mobile viewport's available width — without wrap, an
              un-shrinkable row like this silently widens the *entire
              page* horizontally rather than clipping itself (confirmed:
              a real, reproducible ~390px-viewport regression, same
              mechanism as the social-actions row fix below). */}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setCaptureMode("note_only")} className={scopeButtonClasses(captureMode === "note_only")}>
              {dictionary.memory.captureNoteOnly}
            </button>
            <button
              type="button"
              onClick={() => setCaptureMode("note_with_surrounding")}
              className={scopeButtonClasses(captureMode === "note_with_surrounding")}
            >
              {dictionary.memory.captureSurrounding}
            </button>
          </div>
        </div>

        {/* FREE: social share — a branded PNG anyone can generate, no sign-in, no cost. */}
        <div className="flex flex-col gap-4">
          <span className="text-sm font-medium text-navy">{dictionary.share.socialHeading}</span>
          <ShareCardPicker imageEndpoint={imageEndpoint} fileNamePrefix="mindot-note" />
          <SocialShareActions pageUrl={pageUrl} imageUrl={() => imageEndpoint("square")} fileNamePrefix="mindot-note" />
        </div>

        {/* PAID: the print-quality master — gated behind the existing
            access-code system (features/memories), never generated here
            directly. Deliberately routes to the real, already-working
            /memory/[messageId] flow (sign-in, digital_frame selection,
            code redemption, Shoppier link-out) instead of re-implementing
            any part of that inline — see the EPIC report for why. */}
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-canvas p-5 text-center">
          <span className="font-display text-base font-medium text-navy">{dictionary.share.premiumHeading}</span>
          <p className="text-sm text-ink-soft">{dictionary.share.premiumBody}</p>
          <Button href={`/memory/${messageId}`} variant="secondary">
            {dictionary.share.premiumDownloadButton}
          </Button>
          <p className="text-xs text-ink-soft">{dictionary.share.premiumDownloadHint}</p>
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
