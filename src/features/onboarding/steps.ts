/**
 * Onboarding step order. City first, then the optional status,
 * profile and repository steps, then the optional follow step, which exists
 * only when the chosen city has at least one eligible builder.
 */
export type OnboardingStep = 'city' | 'status' | 'profile' | 'repos' | 'follow'

const BASE_STEPS: ReadonlyArray<OnboardingStep> = [
  'city',
  'status',
  'profile',
  'repos',
]

export function getOnboardingSteps(
  hasBuilderSuggestions: boolean,
): OnboardingStep[] {
  return hasBuilderSuggestions ? [...BASE_STEPS, 'follow'] : [...BASE_STEPS]
}

/** The step after `step`, or null when `step` is the last one. */
export function getNextOnboardingStep(
  steps: ReadonlyArray<OnboardingStep>,
  step: OnboardingStep,
): OnboardingStep | null {
  const index = steps.indexOf(step)
  return index >= 0 && index < steps.length - 1 ? steps[index + 1] : null
}
