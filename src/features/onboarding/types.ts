/**
 * The two ways onboarding stops auto-appearing: reaching the final step's
 * primary action, or dismissing it early (Skip, the close control,
 * Escape, or a backdrop click). Both are terminal — neither is treated as
 * "more complete" than the other for persistence purposes.
 */
export type OnboardingOutcome = "completed" | "skipped";

export const ONBOARDING_STEP_COUNT = 4;

export type OnboardingStepIndex = 0 | 1 | 2 | 3;
