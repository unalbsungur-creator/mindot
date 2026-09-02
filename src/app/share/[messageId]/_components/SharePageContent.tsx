"use client";

import { useState } from "react";
import Link from "next/link";
import { PageContainer } from "@/components/layout/PageContainer";
import type { PublicMessageDetail } from "@/features/board/types";
import type { MemoryCaptureMode } from "@/features/memories/types";
import { Note } from "@/features/notes/components/Note";
import type { NoteData } from "@/features/notes/types";
import { ShareCardPicker } from "@/features/sharing/components/ShareCardPicker";
import { useLocale } from "@/i18n/LocaleProvider";
import { cn } from "@/lib/cn";

interface SharePageContentProps {
  messageId: string;
  message: PublicMessageDetail | null;
}

const scopeButtonClasses = (active: boolean) =>
  cn(
    "rounded-pill border px-3 py-1.5 text-xs font-medium transition-colors",
    active ? "border-orange bg-orange text-navy" : "border-border text-ink-soft hover:text-navy"
  );

export function SharePageContent({ messageId, message }: SharePageContentProps) {
  const { dictionary } = useLocale();
  const [captureMode, setCaptureMode] = useState<MemoryCaptureMode>("note_only");

  if (!message) {
    return (
      <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center py-16">
        <PageContainer className="mx-auto flex max-w-md flex-col items-center gap-3 text-center">
          <h1 className="font-display text-2xl font-medium text-navy">{dictionary.memory.notEligibleTitle}</h1>
          <p className="text-ink-soft">{dictionary.memory.notEligibleBody}</p>
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

  return (
    <PageContainer className="flex flex-col items-center gap-8 py-16">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="font-display text-2xl font-medium text-navy">{dictionary.share.pageTitle}</h1>
        <p className="max-w-md text-sm text-ink-soft">{dictionary.share.pageSubtitle}</p>
      </div>

      <Note note={previewNote} variant="static" />

      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-navy">{dictionary.share.scopeLabel}</span>
          <div className="flex gap-2">
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

        <ShareCardPicker
          imageEndpoint={(formatId) => `/api/share/note/${messageId}/${formatId}?mode=${captureMode}`}
          fileNamePrefix="mindot-note"
        />
      </div>

      <Link href="/board" className="text-sm font-medium text-ink-soft hover:text-navy">
        {dictionary.states.board}
      </Link>
    </PageContainer>
  );
}
