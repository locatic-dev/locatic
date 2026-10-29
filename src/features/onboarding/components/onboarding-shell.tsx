import { useId, type ReactNode, type Ref } from 'react'

import { Button } from '@/components/ui/button'
import { Logo } from '@/components/ui/logo'
import { ArrowRight } from '@/lib/icons'

export const sectionCopyClass =
  'mt-2 font-sans text-sm leading-[1.55] text-text-muted'
export const fieldLabelClass =
  'mb-1.5 block font-mono text-[11.5px] text-text-muted'
// No text size here: the shared `Input` keeps 16px on touch and 14px from md.
export const fieldInputClass = 'h-11'
// Bios are user-authored prose, so they are written in Sans.
export const bodyTextareaClass = 'min-h-22 font-sans'

function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2 font-mono">
      {Array.from({ length: total }).map((_, index) => (
        <div
          key={index}
          aria-hidden="true"
          className={`h-1.5 rounded-pill transition-all duration-200 ${
            index === current ? 'w-6' : 'w-1.5'
          } ${index <= current ? 'bg-brand' : 'bg-line'}`}
        />
      ))}
      <span className="ml-2 text-[11.5px] text-text-muted">
        step {current + 1} of {total}
      </span>
    </div>
  )
}

/**
 * One onboarding step: brand row, progress, the step heading and its copy.
 * The heading is the focus target on every step change, so it is reachable
 * programmatically (`tabIndex={-1}`) but not in the tab order.
 */
export function OnboardingShell({
  children,
  description,
  headingRef,
  stepIndex,
  title,
  totalSteps,
}: {
  children: ReactNode
  description: ReactNode
  headingRef: Ref<HTMLHeadingElement>
  stepIndex: number
  title: ReactNode
  totalSteps: number
}) {
  return (
    <div className="flex w-full max-w-180 flex-col gap-7 rounded-card border border-line bg-surface p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <Logo size={20} />
          <span className="text-title font-bold text-text">locatic</span>
        </div>
        <StepDots current={stepIndex} total={totalSteps} />
      </div>
      <div>
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="m-0 font-sans text-[26px] font-semibold tracking-[-0.03em] text-text focus:outline-none"
        >
          {title}
        </h1>
        <p className={sectionCopyClass}>{description}</p>
      </div>
      {children}
    </div>
  )
}

/**
 * Back, skip and continue for a step. A disabled continue always says why in
 * visible text beside it; a finish failure renders inline as an
 * alert and the answers stay in place for a retry.
 */
export function StepNav({
  disabledReason,
  error,
  isLast,
  onBack,
  onContinue,
  onSkip,
  saving,
  skipLabel = 'skip for now',
}: {
  /** Shown, and the continue button disabled, while set. */
  disabledReason?: string | null
  error?: string | null
  isLast: boolean
  onBack?: () => void
  onContinue: () => void
  onSkip?: () => void
  saving: boolean
  skipLabel?: string
}) {
  const reasonId = useId()
  const continueDisabled = Boolean(disabledReason) || saving

  return (
    <div className="mt-auto flex flex-wrap items-center justify-between gap-3">
      {onBack ? (
        <Button
          type="button"
          variant="ghost"
          size="touch"
          onClick={onBack}
          disabled={saving}
        >
          ← back
        </Button>
      ) : (
        <span aria-hidden="true" />
      )}
      <div className="ml-auto flex flex-wrap items-center justify-end gap-3">
        {error && (
          <p role="alert" className="m-0 font-mono text-[12px] text-danger">
            {error}
          </p>
        )}
        {disabledReason && (
          <p
            id={reasonId}
            className="m-0 font-mono text-[12px] text-text-muted"
          >
            {disabledReason}
          </p>
        )}
        {onSkip && (
          <Button
            type="button"
            variant="ghost"
            size="meta"
            disabled={saving}
            onClick={onSkip}
          >
            {skipLabel}
          </Button>
        )}
        <Button
          type="button"
          variant="primary"
          size="meta"
          disabled={continueDisabled}
          aria-describedby={disabledReason ? reasonId : undefined}
          onClick={onContinue}
        >
          {isLast ? (saving ? 'saving…' : 'finish') : 'continue'}
          {!isLast && <ArrowRight size={13} strokeWidth={2} />}
        </Button>
      </div>
      {isLast && (
        <p className="m-0 basis-full text-right font-mono text-meta text-text-muted">
          We'll email occasional Locatic updates. Turn them off any time in
          Settings.
        </p>
      )}
    </div>
  )
}
