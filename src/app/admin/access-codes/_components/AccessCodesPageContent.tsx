"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { PageContainer } from "@/components/layout/PageContainer";
import { issueManualAccessCode, revokeAccessCodeAdmin } from "@/features/memories/actions";
import type { DigitalAccessCode, DigitalAccessCodeStatus } from "@/features/memories/types";
import { cn } from "@/lib/cn";
import { useLocale } from "@/i18n/LocaleProvider";

interface AccessCodesPageContentProps {
  authorized: boolean;
  codes: DigitalAccessCode[];
}

export function AccessCodesPageContent({ authorized, codes: initial }: AccessCodesPageContentProps) {
  const { dictionary } = useLocale();
  const [codes, setCodes] = useState(initial);
  const [reference, setReference] = useState("");
  const [isPending, startTransition] = useTransition();
  const [createError, setCreateError] = useState(false);
  const [justCreated, setJustCreated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!authorized) {
    return (
      <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center py-16">
        <PageContainer className="mx-auto flex max-w-md flex-col items-center gap-3 text-center">
          <h1 className="font-display text-2xl font-medium text-navy">
            {dictionary.moderation.unauthorizedTitle}
          </h1>
          <p className="text-ink-soft">{dictionary.moderation.unauthorizedBody}</p>
        </PageContainer>
      </div>
    );
  }

  function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setCreateError(false);
    startTransition(async () => {
      const result = await issueManualAccessCode({ reference: reference.trim() || undefined });
      if (!result.ok || !result.data) {
        setCreateError(true);
        return;
      }
      setJustCreated(result.data.code);
      setReference("");
      setCodes((current) => [result.data!, ...current]);
    });
  }

  function handleCopy(code: string) {
    navigator.clipboard
      .writeText(code)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  }

  function handleRevoke(id: string) {
    startTransition(async () => {
      const result = await revokeAccessCodeAdmin(id);
      if (result.ok && result.data) {
        setCodes((current) => current.map((item) => (item.id === id ? result.data! : item)));
      }
    });
  }

  return (
    <PageContainer className="flex flex-col gap-10 py-16">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-medium text-navy sm:text-4xl">
          {dictionary.adminAccessCodes.title}
        </h1>
        <p className="text-ink-soft">{dictionary.adminAccessCodes.subtitle}</p>
      </div>

      <form onSubmit={handleCreate} className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5">
        <h2 className="font-display text-lg font-medium text-navy">{dictionary.adminAccessCodes.createHeading}</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-1 flex-col gap-2">
            <label htmlFor="reference" className="text-sm font-medium text-navy">
              {dictionary.adminAccessCodes.referenceLabel}
            </label>
            <input
              id="reference"
              type="text"
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              placeholder={dictionary.adminAccessCodes.referencePlaceholder}
              className="w-full rounded-md border border-border bg-surface p-2.5 text-sm text-ink shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange"
            />
          </div>
          <Button type="submit" size="sm" disabled={isPending}>
            {isPending ? dictionary.adminAccessCodes.creating : dictionary.adminAccessCodes.createButton}
          </Button>
        </div>
        {createError && <p className="text-sm text-red-600">{dictionary.adminAccessCodes.createError}</p>}
        {justCreated && (
          <div className="flex items-center gap-2 rounded-md border border-orange/30 bg-orange-tint/40 px-3 py-2">
            <span className="text-xs font-medium text-ink-soft">{dictionary.adminAccessCodes.createdCodeLabel}:</span>
            <span className="font-mono text-sm font-semibold text-navy">{justCreated}</span>
            <Button type="button" size="sm" variant="ghost" onClick={() => handleCopy(justCreated)}>
              {copied ? dictionary.adminAccessCodes.copied : dictionary.adminAccessCodes.copyButton}
            </Button>
          </div>
        )}
      </form>

      <div className="flex flex-col gap-4">
        <h2 className="font-display text-xl font-medium text-navy">{dictionary.adminAccessCodes.listHeading}</h2>
        {codes.length === 0 ? (
          <p className="text-sm text-ink-soft">{dictionary.adminAccessCodes.noCodesYet}</p>
        ) : (
          <div className="flex flex-col gap-3">
            {codes.map((code) => (
              <CodeRow key={code.id} code={code} isPending={isPending} onRevoke={handleRevoke} />
            ))}
          </div>
        )}
      </div>
    </PageContainer>
  );
}

const statusBadgeClasses: Record<DigitalAccessCodeStatus, string> = {
  active: "border-navy/20 bg-navy/5 text-navy",
  redeemed: "border-border bg-canvas text-ink-soft",
  expired: "border-border bg-canvas text-ink-soft",
  revoked: "border-red-200 bg-red-50 text-red-700",
};

function CodeRow({
  code,
  isPending,
  onRevoke,
}: {
  code: DigitalAccessCode;
  isPending: boolean;
  onRevoke: (id: string) => void;
}) {
  const { dictionary } = useLocale();

  const statusLabel: Record<DigitalAccessCodeStatus, string> = {
    active: dictionary.adminAccessCodes.statusActive,
    redeemed: dictionary.adminAccessCodes.statusRedeemed,
    expired: dictionary.adminAccessCodes.statusExpired,
    revoked: dictionary.adminAccessCodes.statusRevoked,
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-1">
        <span className="font-mono text-sm font-semibold text-navy">{code.code}</span>
        <span className="text-xs text-ink-soft">
          {dictionary.adminAccessCodes.createdLabel}: {new Date(code.createdAt).toLocaleString()}
        </span>
        <span className="text-xs text-ink-soft">
          {dictionary.adminAccessCodes.projectLabel}: {code.memoryProjectId ?? dictionary.adminAccessCodes.noProject}
        </span>
        {code.redeemedAt && (
          <span className="text-xs text-ink-soft">
            {dictionary.adminAccessCodes.redeemedLabel}: {new Date(code.redeemedAt).toLocaleString()}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Badge className={cn("normal-case", statusBadgeClasses[code.status])}>{statusLabel[code.status]}</Badge>
        {code.status === "active" && (
          <Button type="button" size="sm" variant="ghost" onClick={() => onRevoke(code.id)} disabled={isPending}>
            {isPending ? dictionary.adminAccessCodes.revoking : dictionary.adminAccessCodes.revokeButton}
          </Button>
        )}
      </div>
    </div>
  );
}
