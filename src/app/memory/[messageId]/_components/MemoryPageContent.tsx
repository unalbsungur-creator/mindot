"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { SignInOptions } from "@/components/auth/SignInOptions";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/Button";
import type { PublicMessageDetail } from "@/features/board/types";
import {
  createMemoryProject,
  createPhysicalOrder,
  redeemAccessCode,
  type MemoryActionError,
} from "@/features/memories/actions";
import { PersonalPdfAccess } from "@/features/memories/components/PersonalPdfAccess";
import { NEW_MEMORY_PROJECT_CAPTURE_MODE } from "@/features/memories/lib/outputPolicy";
import type { MemoryOutputType, MemoryProject, PhysicalOrder } from "@/features/memories/types";
import { Note } from "@/features/notes/components/Note";
import type { NoteData } from "@/features/notes/types";
import { ShareCardPicker } from "@/features/sharing/components/ShareCardPicker";
import { useLocale } from "@/i18n/LocaleProvider";
import type { Dictionary } from "@/i18n/translations";

export interface ExistingProjectView {
  project: MemoryProject;
  /** Re-derived from the database on every page load — never trusted from client memory. */
  accessGranted: boolean;
  physicalOrder: PhysicalOrder | null;
  /** personal_pdf only: whether a memory_pdf_unlocks row exists for it (any source). Re-derived per page load. */
  pdfUnlocked: boolean;
}

interface MemoryPageContentProps {
  messageId: string;
  message: PublicMessageDetail | null;
  isSignedIn: boolean;
  existingProjects: ExistingProjectView[];
  /** The signed-in user's token wallet balance, read server-side (0 when signed out). */
  tokenBalance: number;
  /** Read by the server page — never env in this client component. */
  purchaseLinks: PurchaseLinks;
}

/** Public storefront links; null = that flow isn't available yet. */
export interface PurchaseLinks {
  shoppierProductUrl: string | null;
  dilekkutumUrl: string | null;
}

/** Page-wide PDF unlock state, so every personal_pdf panel shares one balance. */
interface PdfAccessState {
  balance: number;
  unlockedIds: ReadonlySet<string>;
  onUnlocked: (projectId: string, balance: number) => void;
  onBalanceChange: (balance: number) => void;
}

type Step = "preview" | "result";

const errorMessage = (dictionary: Dictionary): Record<MemoryActionError, string> => ({
  "auth-required": dictionary.write.signInRequired,
  "message-not-eligible": dictionary.memory.notEligibleBody,
  "invalid-output-type": dictionary.memory.createError,
  "invalid-capture-mode": dictionary.memory.createError,
  "invalid-frame": dictionary.memory.createError,
  "not-found": dictionary.memory.createError,
  forbidden: dictionary.memory.createError,
  "code-not-found": dictionary.memory.codeErrorNotFound,
  "code-already-used": dictionary.memory.codeErrorAlreadyUsed,
  "code-revoked": dictionary.memory.codeErrorRevoked,
  "code-expired": dictionary.memory.codeErrorExpired,
  "invalid-code": dictionary.memory.redeemError,
});

export function MemoryPageContent({ messageId, message, isSignedIn, existingProjects, tokenBalance, purchaseLinks }: MemoryPageContentProps) {
  const { dictionary } = useLocale();

  const [balance, setBalance] = useState(tokenBalance);
  const [unlockedIds, setUnlockedIds] = useState<ReadonlySet<string>>(
    () => new Set(existingProjects.filter((view) => view.pdfUnlocked).map((view) => view.project.id))
  );
  const pdfAccess: PdfAccessState = {
    balance,
    unlockedIds,
    onUnlocked: (projectId, nextBalance) => {
      setUnlockedIds((previous) => new Set(previous).add(projectId));
      setBalance(nextBalance);
    },
    onBalanceChange: setBalance,
  };

  const [showWizard, setShowWizard] = useState(existingProjects.length === 0);
  // The wizard starts at the preview: the capture step ("note only" vs
  // "note + surrounding wall") is gone, every new project is note_only.
  const [step, setStep] = useState<Step>("preview");
  // No format-selection step anymore (see the "capture" step's Continue
  // button) — the free wizard only ever produces a visually-shareable
  // project, so nothing ever sets this beyond its initial value. Kept as
  // `useState` (rather than a plain const) so `handleCreate`'s existing
  // `outputType === "physical_gift"`/`"digital_frame"` checks keep
  // comparing against the full `MemoryOutputType` union instead of a
  // narrowed literal.
  const [outputType] = useState<MemoryOutputType>("personal_pdf");
  const [isPending, startTransition] = useTransition();
  const [createError, setCreateError] = useState<MemoryActionError | null>(null);
  const [newProject, setNewProject] = useState<ExistingProjectView | null>(null);

  if (!message) {
    return (
      <div className="flex min-h-page-panel items-center justify-center py-16">
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
    fontFamily: message.fontFamily,
    textAlign: message.textAlign,
    size: "lg",
    rotation: 0,
    position: { top: "0%", left: "0%" },
    language: message.language,
  };

  function handleCreate() {
    setCreateError(null);
    startTransition(async () => {
      const result = await createMemoryProject({
        messageId,
        captureMode: NEW_MEMORY_PROJECT_CAPTURE_MODE,
        outputType,
      });
      if (!result.ok || !result.data) {
        setCreateError(result.error ?? "not-found");
        return;
      }

      let physicalOrder: PhysicalOrder | null = null;
      // EPIC 053: never mint a real order number (or send anyone toward the
      // real DilekKutum storefront) while the pre-launch commercial phase
      // isn't active — same "unset env var means not live yet" fail-safe
      // the Shoppier link already uses for the digital path below.
      if (outputType === "physical_gift" && purchaseLinks.dilekkutumUrl) {
        const orderResult = await createPhysicalOrder(result.data.id);
        if (orderResult.ok && orderResult.data) physicalOrder = orderResult.data;
      }

      setNewProject({ project: result.data, accessGranted: outputType !== "digital_frame", physicalOrder, pdfUnlocked: false });
      setStep("result");
    });
  }

  if (!isSignedIn) {
    return (
      <div className="flex min-h-page-panel items-center justify-center py-16">
        <PageContainer className="mx-auto flex max-w-md flex-col items-center gap-6 text-center">
          <h1 className="font-display text-2xl font-medium text-navy">{dictionary.memory.pageTitle}</h1>
          <Note note={previewNote} variant="static" />
          <p className="text-ink-soft">{dictionary.write.signInRequired}</p>
          <SignInOptions redirectTo={`/memory/${messageId}`} />
        </PageContainer>
      </div>
    );
  }

  return (
    <PageContainer className="mx-auto flex max-w-3xl flex-col gap-8 py-16">
      <h1 className="text-center font-display text-3xl font-medium text-navy sm:text-4xl">
        {dictionary.memory.pageTitle}
      </h1>

      <div className="flex justify-center">
        <Note note={previewNote} variant="static" />
      </div>

      {existingProjects.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="font-display text-xl font-medium text-navy">{dictionary.memory.existingProjectsHeading}</h2>
          {existingProjects.map((view) => (
            <OutcomePanel key={view.project.id} view={view} pdfAccess={pdfAccess} purchaseLinks={purchaseLinks} />
          ))}
          {!showWizard && (
            <Button variant="ghost" onClick={() => setShowWizard(true)}>
              {dictionary.memory.startAnotherButton}
            </Button>
          )}
        </section>
      )}

      {showWizard && (
        <>
          {step === "preview" && (
            <section className="flex flex-col items-center gap-4">
              <h2 className="font-display text-xl font-medium text-navy">{dictionary.memory.step4Heading}</h2>
              <p className="max-w-md text-center text-sm text-ink-soft">{dictionary.memory.previewDisclaimer}</p>
              {createError && <p className="text-sm text-red-600">{errorMessage(dictionary)[createError]}</p>}
              <div className="flex gap-2">
                {/* The first step now — "back" only exists when there's a project list to return to. */}
                {existingProjects.length > 0 && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setCreateError(null);
                      setShowWizard(false);
                    }}
                  >
                    {dictionary.memory.backButton}
                  </Button>
                )}
                <Button onClick={handleCreate} disabled={isPending}>
                  {isPending ? dictionary.memory.creating : dictionary.memory.createButton}
                </Button>
              </div>
            </section>
          )}

          {step === "result" && newProject && (
            <section className="rounded-lg border border-border bg-surface p-8">
              <OutcomePanel view={newProject} pdfAccess={pdfAccess} purchaseLinks={purchaseLinks} />
            </section>
          )}
        </>
      )}
    </PageContainer>
  );
}

function OutcomePanel({
  view,
  pdfAccess,
  purchaseLinks,
}: {
  view: ExistingProjectView;
  pdfAccess: PdfAccessState;
  purchaseLinks: PurchaseLinks;
}) {
  const { dictionary } = useLocale();
  const { project } = view;
  return (
    <div className="flex flex-col items-center gap-4">
      {project.outputType === "personal_pdf" && <PersonalPdfPanel project={project} pdfAccess={pdfAccess} />}
      {project.outputType === "digital_frame" && (
        <DigitalAccessPanel project={project} initiallyGranted={view.accessGranted} shoppierProductUrl={purchaseLinks.shoppierProductUrl} />
      )}
      {project.outputType === "physical_gift" && <PhysicalOrderPanel order={view.physicalOrder} dilekkutumUrl={purchaseLinks.dilekkutumUrl} />}
      <Link href="/me/memories" className="text-sm font-medium text-ink-soft hover:text-navy">
        {dictionary.profile.memoriesLinkLabel}
      </Link>
    </div>
  );
}

function PersonalPdfPanel({ project, pdfAccess }: { project: MemoryProject; pdfAccess: PdfAccessState }) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <PersonalPdfAccess
        projectId={project.id}
        unlocked={pdfAccess.unlockedIds.has(project.id)}
        balance={pdfAccess.balance}
        // Panels only render once the page's own getPublicMessageById
        // returned the message (see the early "not eligible" return above).
        sourceAvailable
        onUnlocked={pdfAccess.onUnlocked}
        onBalanceChange={pdfAccess.onBalanceChange}
        className="items-center"
      />
      <MemoryShareSection projectId={project.id} />
    </div>
  );
}

function MemoryShareSection({ projectId }: { projectId: string }) {
  const { dictionary } = useLocale();
  return (
    <div className="flex w-full max-w-xs flex-col gap-2 border-t border-border pt-4">
      <span className="text-sm font-medium text-navy">{dictionary.share.memoryShareHeading}</span>
      <ShareCardPicker imageEndpoint={(formatId) => `/api/share/memory/${projectId}/${formatId}`} fileNamePrefix="mindot-memory" />
    </div>
  );
}

function DigitalAccessPanel({
  project,
  initiallyGranted,
  shoppierProductUrl,
}: {
  project: MemoryProject;
  initiallyGranted: boolean;
  shoppierProductUrl: string | null;
}) {
  const { dictionary } = useLocale();
  const [granted, setGranted] = useState(initiallyGranted);
  const [accessCode, setAccessCode] = useState("");
  const [error, setError] = useState<MemoryActionError | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleRedeem() {
    setError(null);
    startTransition(async () => {
      const result = await redeemAccessCode(project.id, accessCode);
      if (!result.ok) {
        setError(result.error ?? "invalid-code");
        return;
      }
      setGranted(true);
    });
  }

  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <h3 className="font-display text-lg font-medium text-navy">{dictionary.memory.accessStatusHeading}</h3>

      {granted ? (
        <>
          <p className="text-sm text-navy">{dictionary.memory.accessGranted}</p>
          <MemoryShareSection projectId={project.id} />
        </>
      ) : (
        <>
          <p className="text-sm text-ink-soft">{dictionary.memory.accessNotPurchased}</p>
          {shoppierProductUrl ? (
            <Button href={shoppierProductUrl} target="_blank" rel="noopener noreferrer" variant="ghost">
              {dictionary.memory.shoppierButton}
            </Button>
          ) : (
            <p className="max-w-xs text-sm text-orange-ink">{dictionary.memory.shoppierUnavailable}</p>
          )}
          <p className="text-sm text-ink-soft">{dictionary.memory.accessCodeAvailable}</p>
          <div className="flex w-full max-w-xs flex-col gap-2">
            <label htmlFor={`code-${project.id}`} className="sr-only">
              {dictionary.memory.codeLabel}
            </label>
            <input
              id={`code-${project.id}`}
              type="text"
              value={accessCode}
              onChange={(event) => setAccessCode(event.target.value)}
              placeholder={dictionary.memory.codePlaceholder}
              className="w-full rounded-md border border-border bg-surface p-2.5 text-center text-sm text-ink shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange"
            />
            {error && <p className="text-sm text-red-600">{errorMessage(dictionary)[error]}</p>}
            <Button variant="ghost" onClick={handleRedeem} disabled={isPending}>
              {isPending ? dictionary.memory.redeeming : dictionary.memory.redeemButton}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function PhysicalOrderPanel({ order, dilekkutumUrl }: { order: PhysicalOrder | null; dilekkutumUrl: string | null }) {
  const { dictionary } = useLocale();
  const [copied, setCopied] = useState(false);

  // EPIC 053: `order` is null both when the physical-gift flow isn't live
  // yet (no DilekKutum link, see handleCreate above) and — unchanged from
  // before — if `createPhysicalOrder` itself ever fails; either way, an
  // honest "not available yet" message (same shape as `shoppierUnavailable`
  // below) is correct, never a silently blank panel.
  if (!order) {
    return <p className="max-w-xs text-sm text-orange-ink">{dictionary.memory.physicalUnavailable}</p>;
  }

  function handleCopy() {
    navigator.clipboard
      .writeText(order!.orderNumber)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  }

  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <h3 className="font-display text-lg font-medium text-navy">{dictionary.memory.physicalHeading}</h3>
      <div className="flex items-center gap-2">
        <input
          type="text"
          readOnly
          value={order.orderNumber}
          onFocus={(event) => event.currentTarget.select()}
          className="rounded-md border border-border bg-canvas px-4 py-2 text-center text-lg font-semibold tracking-wide text-navy"
        />
        <Button variant="ghost" size="sm" onClick={handleCopy}>
          {copied ? dictionary.memory.copied : dictionary.memory.copyButton}
        </Button>
      </div>
      <p className="max-w-sm text-sm text-ink-soft">{dictionary.memory.physicalInstructions}</p>
      <ol className="flex max-w-sm flex-col gap-1.5 text-left text-xs text-ink-soft">
        {dictionary.memory.physicalSteps.map((text, index) => (
          <li key={text}>
            {index + 1}. {text}
          </li>
        ))}
      </ol>
      {dilekkutumUrl && (
        <Button href={dilekkutumUrl} target="_blank" rel="noopener noreferrer">
          {dictionary.memory.dilekkutumButton}
        </Button>
      )}
      <MemoryShareSection projectId={order.memoryProjectId} />
    </div>
  );
}
