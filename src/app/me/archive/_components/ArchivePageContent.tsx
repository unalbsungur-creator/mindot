"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { PageContainer } from "@/components/layout/PageContainer";
import { Badge } from "@/components/ui/Badge";
import { TILE_PX } from "@/features/board/lib/worldGeometry";
import { getNoteTemplate } from "@/features/notes/config/templates";
import { Note } from "@/features/notes/components/Note";
import { setMessageWallVisibility } from "@/features/profile/actions";
import { TimeRangeFilter } from "@/features/profile/components/TimeRangeFilter";
import type { ArchiveMessage } from "@/features/profile/types";
import { useLocale } from "@/i18n/LocaleProvider";
import type { Dictionary } from "@/i18n/translations";
import { cn } from "@/lib/cn";

interface ArchivePageContentProps {
  isSignedIn: boolean;
  messages: ArchiveMessage[];
}

function stateLabel(dictionary: Dictionary, state: ArchiveMessage["state"]): string {
  return {
    pending: dictionary.archive.statePending,
    published: dictionary.archive.statePublished,
    not_published: dictionary.archive.stateNotPublished,
  }[state];
}

function boardLinkFor(tile: { x: number; y: number }): string {
  const centerX = Math.round(tile.x * TILE_PX + TILE_PX / 2);
  const centerY = Math.round(tile.y * TILE_PX + TILE_PX / 2);
  return `/board?x=${centerX}&y=${centerY}&z=1`;
}

export function ArchivePageContent({ isSignedIn, messages: initialMessages }: ArchivePageContentProps) {
  const { dictionary } = useLocale();
  const searchParams = useSearchParams();
  const hasFilter = searchParams.has("from") || searchParams.has("to");
  const [messages, setMessages] = useState(initialMessages);

  if (!isSignedIn) {
    return (
      <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center py-16">
        <PageContainer className="mx-auto flex max-w-md flex-col items-center gap-6 text-center">
          <h1 className="font-display text-2xl font-medium text-navy">{dictionary.archive.pageTitle}</h1>
          <GoogleSignInButton redirectTo="/me/archive" />
        </PageContainer>
      </div>
    );
  }

  return (
    <PageContainer className="mx-auto flex max-w-2xl flex-col gap-8 py-16">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="font-display text-2xl font-medium text-navy">{dictionary.archive.pageTitle}</h1>
        <p className="text-sm text-ink-soft">{dictionary.archive.subtitle}</p>
      </div>

      <TimeRangeFilter />

      {messages.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="text-sm text-ink-soft">
            {hasFilter ? dictionary.archive.emptyMessage : dictionary.archive.emptyMessageAllTime}
          </p>
          {hasFilter ? (
            <Link href="/me/archive" className="text-sm font-medium text-ink-soft hover:text-navy">
              {dictionary.archive.allTime}
            </Link>
          ) : (
            <Link href="/write" className="text-sm font-medium text-ink-soft hover:text-navy">
              {dictionary.nav.writeThought}
            </Link>
          )}
        </div>
      ) : (
        <ul className="flex flex-col gap-4">
          {messages.map((message) => {
            const template = getNoteTemplate(message.templateId);
            const eligibleForWall = message.state === "published" && !message.isAnonymous;
            return (
              <li key={message.id} className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 sm:flex-row sm:items-center">
                <div className="flex justify-center sm:shrink-0">
                  <Note
                    variant="static"
                    note={{
                      id: message.id,
                      content: message.content,
                      authorName: "",
                      authorImage: null,
                      templateId: message.templateId,
                      size: "sm",
                      rotation: 0,
                      position: { top: "0%", left: "0%" },
                      language: message.language,
                    }}
                  />
                </div>
                <div className="flex flex-1 flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      className={cn(
                        "normal-case",
                        message.state === "published" && "border-navy/20 bg-navy/5 text-navy",
                        message.state === "pending" && "border-orange/30 bg-orange-tint/60 text-orange-ink",
                        message.state === "not_published" && "border-border bg-canvas text-ink-soft"
                      )}
                    >
                      {stateLabel(dictionary, message.state)}
                    </Badge>
                    <Badge className="border-border bg-canvas normal-case text-ink-soft">
                      {message.isAnonymous ? dictionary.moderation.anonymousBadge : dictionary.moderation.namedBadge}
                    </Badge>
                    <span className="text-xs text-ink-soft">{template.name}</span>
                  </div>
                  <span className="text-xs text-ink-soft">{new Date(message.createdAt).toLocaleDateString()}</span>
                  <div className="flex flex-wrap items-center gap-3 text-xs font-medium">
                    {message.tile && (
                      <Link href={boardLinkFor(message.tile)} className="text-ink-soft hover:text-navy">
                        {dictionary.archive.viewOnBoardAction}
                      </Link>
                    )}
                    {message.state === "published" && (
                      <>
                        {message.memoryProjectId ? (
                          <Link href={`/memory/${message.id}`} className="text-ink-soft hover:text-navy">
                            {dictionary.archive.viewMemoryAction}
                          </Link>
                        ) : (
                          <Link href={`/memory/${message.id}`} className="text-ink-soft hover:text-navy">
                            {dictionary.memory.preserveAction}
                          </Link>
                        )}
                        <Link href={`/share/${message.id}`} className="text-ink-soft hover:text-navy">
                          {dictionary.share.shareAction}
                        </Link>
                      </>
                    )}
                    {eligibleForWall && (
                      <WallVisibilityToggle
                        messageId={message.id}
                        showOnPersonalWall={message.showOnPersonalWall}
                        onChange={(next) =>
                          setMessages((current) =>
                            current.map((m) => (m.id === message.id ? { ...m, showOnPersonalWall: next } : m))
                          )
                        }
                      />
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </PageContainer>
  );
}

function WallVisibilityToggle({
  messageId,
  showOnPersonalWall,
  onChange,
}: {
  messageId: string;
  showOnPersonalWall: boolean;
  onChange: (next: boolean) => void;
}) {
  const { dictionary } = useLocale();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    const next = !showOnPersonalWall;
    startTransition(async () => {
      const result = await setMessageWallVisibility(messageId, next);
      if (result.ok) onChange(next);
    });
  }

  return (
    <button type="button" onClick={handleClick} disabled={isPending} className="text-ink-soft hover:text-navy disabled:opacity-50">
      {showOnPersonalWall ? dictionary.archive.removeFromWallAction : dictionary.archive.addToWallAction}
    </button>
  );
}
