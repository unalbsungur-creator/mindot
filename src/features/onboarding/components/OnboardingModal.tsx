"use client";

import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { BrandMark } from "@/components/brand/BrandMark";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Note } from "@/features/notes/components/Note";
import { getActiveNoteTemplates } from "@/features/notes/config/templates";
import type { NoteData } from "@/features/notes/types";
import { useLocale } from "@/i18n/LocaleProvider";
import { cn } from "@/lib/cn";
import { hasSeenOnboarding, recordOnboardingOutcome, subscribeToOnboardingOpenRequests } from "../lib/state";
import { ONBOARDING_STEP_COUNT, type OnboardingOutcome, type OnboardingStepIndex } from "../types";

const HEADING_ID = "onboarding-heading";

// Purely illustrative — the surrounding step copy already explains the
// concept, so these mini notes are marked aria-hidden by their container
// and use MINDOT's own dot motif rather than a placeholder name that would
// need translating for no real content value.
function miniNote(id: string, templateId: string, content = "Aa"): NoteData {
  return { id, content, authorName: "·", templateId, size: "sm", rotation: 0, position: { top: "0%", left: "0%" } };
}

/**
 * Mounted once in the root layout — present on every page, but only
 * auto-opens on the homepage for a first-time visitor. Elsewhere it stays
 * dormant until the footer's reopen entry point dispatches an open
 * request. A native <dialog> gives us top-layer stacking, focus trapping,
 * and Escape-to-close for free, so none of that is hand-rolled here.
 */
export function OnboardingModal() {
  const pathname = usePathname();
  const { dictionary } = useLocale();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const outcomeRef = useRef<OnboardingOutcome>("skipped");
  const [step, setStep] = useState<OnboardingStepIndex>(0);

  function openDialog() {
    outcomeRef.current = "skipped";
    setStep(0);
    dialogRef.current?.showModal();
    // The step-change effect below won't re-fire here if step was already
    // 0 (React bails out on an identical value), so focus the heading
    // directly on every open rather than relying on it alone.
    headingRef.current?.focus();
  }

  useEffect(() => {
    if (pathname === "/" && !hasSeenOnboarding()) {
      // Browser-only check (localStorage) — can't run during SSR, so this
      // is the same one-time client correction LocaleProvider already uses.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      openDialog();
    }
  }, [pathname]);

  useEffect(() => subscribeToOnboardingOpenRequests(openDialog), []);

  // Move focus to the new step's heading so screen reader users hear it
  // and keyboard users aren't left on a button that just moved away.
  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  function close(outcome: OnboardingOutcome) {
    outcomeRef.current = outcome;
    dialogRef.current?.close();
  }

  // Fires for every close path — Escape, backdrop click, Skip, the close
  // control, and Finish — so this is the one place the outcome persists.
  function handleClose() {
    recordOnboardingOutcome(outcomeRef.current);
  }

  function handleCancel() {
    // Escape triggers "cancel" before "close" — treat it the same as Skip.
    outcomeRef.current = "skipped";
  }

  function handleBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === dialogRef.current) close("skipped");
  }

  function next() {
    if (step === ONBOARDING_STEP_COUNT - 1) {
      close("completed");
      return;
    }
    setStep((current) => (current + 1) as OnboardingStepIndex);
  }

  function back() {
    setStep((current) => Math.max(0, current - 1) as OnboardingStepIndex);
  }

  const templates = getActiveNoteTemplates();
  const d = dictionary.onboarding;

  const stepContent: { heading: string; body: string; visual: ReactNode }[] = [
    {
      heading: d.step1Heading,
      body: d.step1Body,
      visual: <BrandMark className="h-16 sm:h-20" />,
    },
    {
      heading: d.step2Heading,
      body: d.step2Body,
      visual: (
        <div className="flex flex-col items-center gap-3">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-soft">{d.step2StyleLabel}</p>
          <div aria-hidden="true" className="flex gap-2">
            {templates.slice(0, 3).map((template) => (
              <Note key={template.id} note={miniNote(`onboarding-${template.id}`, template.id)} variant="static" />
            ))}
          </div>
          <div className="flex gap-2">
            <Badge className="normal-case border-border bg-canvas text-ink-soft">{dictionary.moderation.anonymousBadge}</Badge>
            <Badge className="normal-case border-border bg-canvas text-ink-soft">{dictionary.moderation.namedBadge}</Badge>
          </div>
        </div>
      ),
    },
    {
      heading: d.step3Heading,
      body: d.step3Body,
      visual: (
        <div className="flex items-center justify-center gap-4">
          <div className="flex flex-col items-center gap-2">
            <div aria-hidden="true">
              <Note note={miniNote("onboarding-submitted", templates[0]?.id ?? "classic-yellow")} variant="static" />
            </div>
            <Badge>{d.step3SubmittedLabel}</Badge>
          </div>
          <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-ink-soft">
            <path d="M2.5 8h11M9 3.5 13.5 8 9 12.5" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div className="flex flex-col items-center gap-2">
            <div aria-hidden="true" className="flex -space-x-3">
              {templates.slice(1, 4).map((template, index) => (
                <Note
                  key={template.id}
                  note={{ ...miniNote(`onboarding-board-${template.id}`, template.id), rotation: (index - 1) * 6 }}
                  variant="static"
                />
              ))}
            </div>
            <Badge className="border-navy/20 bg-navy/5 text-navy">{d.step3BoardLabel}</Badge>
          </div>
        </div>
      ),
    },
    {
      heading: d.step4Heading,
      body: d.step4Body,
      visual: (
        <ul className="flex w-full max-w-xs flex-col gap-2.5 text-left">
          {[dictionary.memory.outputPersonalPdf, dictionary.memory.outputDigitalFrame, dictionary.memory.outputPhysicalGift].map(
            (label) => (
              <li key={label} className="flex items-center gap-2.5 text-sm text-ink">
                <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-orange" />
                {label}
              </li>
            )
          )}
        </ul>
      ),
    },
  ];

  const current = stepContent[step];

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={HEADING_ID}
      onClose={handleClose}
      onCancel={handleCancel}
      onClick={handleBackdropClick}
      className="m-auto max-h-[85vh] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-lg border border-border bg-surface p-0 shadow-card backdrop:bg-navy/50 backdrop:backdrop-blur-sm"
    >
      <div key={step} className="flex flex-col gap-6 p-6 motion-safe:animate-[onboarding-step-in_var(--motion-base)_var(--ease-standard)] sm:p-8">
        <div className="flex items-start justify-between gap-3">
          <p aria-hidden="true" className="flex gap-1.5 pt-1">
            {Array.from({ length: ONBOARDING_STEP_COUNT }).map((_, index) => (
              <span
                key={index}
                className={cn("h-1.5 w-1.5 rounded-full", index === step ? "bg-orange" : "bg-border")}
              />
            ))}
          </p>
          <button
            type="button"
            aria-label={d.closeLabel}
            onClick={() => close("skipped")}
            className="-m-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-soft hover:text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange"
          >
            <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4">
              <path d="M3 3l10 10M13 3 3 13" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <p className="sr-only" aria-live="polite">
          {d.stepIndicatorLabel.replace("{current}", String(step + 1)).replace("{total}", String(ONBOARDING_STEP_COUNT))}
        </p>

        <div className="flex flex-col items-center gap-5 text-center">
          {current.visual}
          <div className="flex flex-col gap-2">
            <h2
              ref={headingRef}
              id={HEADING_ID}
              tabIndex={-1}
              className="font-display text-xl font-medium text-navy focus-visible:outline-none sm:text-2xl"
            >
              {current.heading}
            </h2>
            <p className="text-sm leading-relaxed text-ink-soft">{current.body}</p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-2">
            {step > 0 && (
              <Button variant="ghost" size="sm" onClick={back}>
                {d.backLabel}
              </Button>
            )}
            {step < ONBOARDING_STEP_COUNT - 1 && (
              <button
                type="button"
                onClick={() => close("skipped")}
                className="min-h-9 rounded-pill px-3 text-sm font-medium text-ink-soft hover:text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange"
              >
                {d.skipLabel}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="primary" size="sm" onClick={next}>
              {step === ONBOARDING_STEP_COUNT - 1 ? d.finishLabel : d.nextLabel}
            </Button>
          </div>
        </div>
      </div>
    </dialog>
  );
}
