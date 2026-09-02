"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/Button";
import type { PublicMessageDetail } from "@/features/board/types";
import {
  createMemoryProject,
  createPhysicalOrder,
  redeemAccessCode,
  type MemoryActionError,
} from "@/features/memories/actions";
import { DILEKKUTUM_URL } from "@/features/memories/config/dilekkutum";
import { getActiveFrameTemplates } from "@/features/memories/config/frameTemplates";
import { SHOPPIER_PRODUCT_URL } from "@/features/memories/config/shoppier";
import type { MemoryCaptureMode, MemoryOutputType, MemoryProject, PhysicalOrder } from "@/features/memories/types";
import { Note } from "@/features/notes/components/Note";
import type { NoteData } from "@/features/notes/types";
import { ShareCardPicker } from "@/features/sharing/components/ShareCardPicker";
import { useLocale } from "@/i18n/LocaleProvider";
import type { Dictionary } from "@/i18n/translations";
import { cn } from "@/lib/cn";

export interface ExistingProjectView {
  project: MemoryProject;
  /** Re-derived from the database on every page load — never trusted from client memory. */
  accessGranted: boolean;
  physicalOrder: PhysicalOrder | null;
}

interface MemoryPageContentProps {
  messageId: string;
  message: PublicMessageDetail | null;
  isSignedIn: boolean;
  existingProjects: ExistingProjectView[];
}

type Step = "capture" | "format" | "preview" | "result";

const errorMessage = (dictionary: Dictionary): Record<MemoryActionError, string> => ({
  "auth-required": dictionary.write.signInRequired,
  "message-not-eligible": dictionary.memory.notEligibleBody,
  "invalid-frame": dictionary.memory.createError,
  "not-found": dictionary.memory.createError,
  forbidden: dictionary.memory.createError,
  "code-not-found": dictionary.memory.codeErrorNotFound,
  "code-already-used": dictionary.memory.codeErrorAlreadyUsed,
  "code-revoked": dictionary.memory.codeErrorRevoked,
  "code-expired": dictionary.memory.codeErrorExpired,
  "invalid-code": dictionary.memory.redeemError,
});

export function MemoryPageContent({ messageId, message, isSignedIn, existingProjects }: MemoryPageContentProps) {
  const { dictionary } = useLocale();
  const frameTemplates = getActiveFrameTemplates();

  const [showWizard, setShowWizard] = useState(existingProjects.length === 0);
  const [step, setStep] = useState<Step>("capture");
  const [captureMode, setCaptureMode] = useState<MemoryCaptureMode>("note_only");
  const [outputType, setOutputType] = useState<MemoryOutputType>("personal_pdf");
  const [frameTemplateId, setFrameTemplateId] = useState(frameTemplates[0]?.id ?? "");
  const [isPending, startTransition] = useTransition();
  const [createError, setCreateError] = useState<MemoryActionError | null>(null);
  const [newProject, setNewProject] = useState<ExistingProjectView | null>(null);

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
        captureMode,
        outputType,
        frameTemplateId: outputType === "digital_frame" ? frameTemplateId : undefined,
      });
      if (!result.ok || !result.data) {
        setCreateError(result.error ?? "not-found");
        return;
      }

      let physicalOrder: PhysicalOrder | null = null;
      if (outputType === "physical_gift") {
        const orderResult = await createPhysicalOrder(result.data.id);
        if (orderResult.ok && orderResult.data) physicalOrder = orderResult.data;
      }

      setNewProject({ project: result.data, accessGranted: outputType !== "digital_frame", physicalOrder });
      setStep("result");
    });
  }

  if (!isSignedIn) {
    return (
      <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center py-16">
        <PageContainer className="mx-auto flex max-w-md flex-col items-center gap-6 text-center">
          <h1 className="font-display text-2xl font-medium text-navy">{dictionary.memory.pageTitle}</h1>
          <Note note={previewNote} variant="static" />
          <p className="text-ink-soft">{dictionary.write.signInRequired}</p>
          <GoogleSignInButton redirectTo={`/memory/${messageId}`} />
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
            <OutcomePanel key={view.project.id} view={view} />
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
          {step === "capture" && (
            <section className="flex flex-col items-center gap-4">
              <h2 className="font-display text-xl font-medium text-navy">{dictionary.memory.step2Heading}</h2>
              <div className="grid w-full gap-3 sm:grid-cols-2">
                <OptionCard
                  selected={captureMode === "note_only"}
                  onSelect={() => setCaptureMode("note_only")}
                  title={dictionary.memory.captureNoteOnly}
                  hint={dictionary.memory.captureNoteOnlyHint}
                />
                <OptionCard
                  selected={captureMode === "note_with_surrounding"}
                  onSelect={() => setCaptureMode("note_with_surrounding")}
                  title={dictionary.memory.captureSurrounding}
                  hint={dictionary.memory.captureSurroundingHint}
                />
              </div>
              <Button onClick={() => setStep("format")}>{dictionary.memory.continueButton}</Button>
            </section>
          )}

          {step === "format" && (
            <section className="flex flex-col items-center gap-4">
              <h2 className="font-display text-xl font-medium text-navy">{dictionary.memory.step3Heading}</h2>
              <div className="grid w-full gap-3 sm:grid-cols-3">
                <OptionCard
                  selected={outputType === "personal_pdf"}
                  onSelect={() => setOutputType("personal_pdf")}
                  title={dictionary.memory.outputPersonalPdf}
                  hint={dictionary.memory.outputPersonalPdfHint}
                />
                <OptionCard
                  selected={outputType === "digital_frame"}
                  onSelect={() => setOutputType("digital_frame")}
                  title={dictionary.memory.outputDigitalFrame}
                  hint={dictionary.memory.outputDigitalFrameHint}
                />
                <OptionCard
                  selected={outputType === "physical_gift"}
                  onSelect={() => setOutputType("physical_gift")}
                  title={dictionary.memory.outputPhysicalGift}
                  hint={dictionary.memory.outputPhysicalGiftHint}
                />
              </div>

              {outputType === "digital_frame" && (
                <div className="flex flex-col gap-2">
                  <span className="text-sm font-medium text-navy">{dictionary.memory.frameLabel}</span>
                  <div className="flex flex-wrap justify-center gap-2">
                    {frameTemplates.map((frame) => (
                      <button
                        key={frame.id}
                        type="button"
                        onClick={() => setFrameTemplateId(frame.id)}
                        aria-pressed={frame.id === frameTemplateId}
                        className={cn(
                          "rounded-pill border px-3 py-1.5 text-xs font-medium transition-colors",
                          frame.id === frameTemplateId
                            ? "border-navy bg-navy text-white"
                            : "border-border bg-surface text-ink-soft hover:text-navy"
                        )}
                      >
                        {frame.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setStep("capture")}>
                  {dictionary.memory.backButton}
                </Button>
                <Button onClick={() => setStep("preview")}>{dictionary.memory.continueButton}</Button>
              </div>
            </section>
          )}

          {step === "preview" && (
            <section className="flex flex-col items-center gap-4">
              <h2 className="font-display text-xl font-medium text-navy">{dictionary.memory.step4Heading}</h2>
              <p className="max-w-md text-center text-sm text-ink-soft">{dictionary.memory.previewDisclaimer}</p>
              {createError && <p className="text-sm text-red-600">{errorMessage(dictionary)[createError]}</p>}
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setStep("format")}>
                  {dictionary.memory.backButton}
                </Button>
                <Button onClick={handleCreate} disabled={isPending}>
                  {isPending ? dictionary.memory.creating : dictionary.memory.createButton}
                </Button>
              </div>
            </section>
          )}

          {step === "result" && newProject && (
            <section className="rounded-lg border border-border bg-surface p-8">
              <OutcomePanel view={newProject} />
            </section>
          )}
        </>
      )}
    </PageContainer>
  );
}

function OutcomePanel({ view }: { view: ExistingProjectView }) {
  const { dictionary } = useLocale();
  const { project } = view;
  return (
    <div className="flex flex-col items-center gap-4">
      {project.outputType === "personal_pdf" && <PersonalPdfPanel project={project} />}
      {project.outputType === "digital_frame" && (
        <DigitalAccessPanel project={project} initiallyGranted={view.accessGranted} />
      )}
      {project.outputType === "physical_gift" && <PhysicalOrderPanel order={view.physicalOrder} />}
      <Link href="/me/memories" className="text-sm font-medium text-ink-soft hover:text-navy">
        {dictionary.profile.memoriesLinkLabel}
      </Link>
    </div>
  );
}

function PersonalPdfPanel({ project }: { project: MemoryProject }) {
  const { dictionary } = useLocale();
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <h3 className="font-display text-lg font-medium text-navy">{dictionary.memory.downloadReadyTitle}</h3>
      <p className="text-sm text-ink-soft">{dictionary.memory.downloadReadyBody}</p>
      <Button href={`/api/memories/${project.id}/download`}>{dictionary.memory.downloadButton}</Button>
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

function DigitalAccessPanel({ project, initiallyGranted }: { project: MemoryProject; initiallyGranted: boolean }) {
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
          <Button href={`/api/memories/${project.id}/download`}>{dictionary.memory.downloadButton}</Button>
          <MemoryShareSection projectId={project.id} />
        </>
      ) : (
        <>
          <p className="text-sm text-ink-soft">{dictionary.memory.accessNotPurchased}</p>
          {SHOPPIER_PRODUCT_URL ? (
            <Button href={SHOPPIER_PRODUCT_URL} target="_blank" rel="noopener noreferrer" variant="ghost">
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

function PhysicalOrderPanel({ order }: { order: PhysicalOrder | null }) {
  const { dictionary } = useLocale();
  const [copied, setCopied] = useState(false);

  if (!order) return null;

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
      <Button href={DILEKKUTUM_URL} target="_blank" rel="noopener noreferrer">
        {dictionary.memory.dilekkutumButton}
      </Button>
      <MemoryShareSection projectId={order.memoryProjectId} />
    </div>
  );
}

function OptionCard({
  selected,
  onSelect,
  title,
  hint,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "flex flex-col items-start gap-1 rounded-md border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange",
        selected ? "border-navy bg-navy/5" : "border-border bg-surface hover:border-navy/40"
      )}
    >
      <span className="text-sm font-medium text-navy">{title}</span>
      <span className="text-xs text-ink-soft">{hint}</span>
    </button>
  );
}
