import { BUILD_STATUS, StatusPill } from '@/components/ui/status-pill'

export type OnboardingBuildStatus = keyof typeof BUILD_STATUS

/** Native radios, so arrow keys and Space work without extra handlers. */
export function StatusStepFields({
  onChange,
  value,
}: {
  onChange: (status: OnboardingBuildStatus) => void
  value: OnboardingBuildStatus | ''
}) {
  return (
    <fieldset className="m-0 border-0 p-0">
      <legend className="sr-only">build status</legend>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {(
          Object.entries(BUILD_STATUS) as Array<
            [
              OnboardingBuildStatus,
              (typeof BUILD_STATUS)[OnboardingBuildStatus],
            ]
          >
        ).map(([id, meta]) => {
          const isSelected = value === id
          const inputId = `onboarding-build-status-${id}`

          return (
            <div key={id}>
              <input
                id={inputId}
                type="radio"
                name="onboarding-build-status"
                value={id}
                checked={isSelected}
                onChange={(event) => {
                  if (event.target.checked) {
                    onChange(id)
                  }
                }}
                className="peer sr-only"
              />
              <label
                htmlFor={inputId}
                className={`flex cursor-pointer flex-col gap-2 rounded border px-4 py-3.5 text-left transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-brand/40 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-canvas ${
                  isSelected
                    ? 'border-brand bg-brand/5'
                    : 'border-line bg-canvas'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <StatusPill status={id} size="md" />
                  <div
                    aria-hidden="true"
                    className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full ${
                      isSelected
                        ? 'bg-brand'
                        : 'border-[1.5px] border-line-strong bg-transparent'
                    }`}
                  >
                    {isSelected && (
                      <div className="h-1.25 w-1.25 rounded-full bg-canvas" />
                    )}
                  </div>
                </div>
                <div className="font-sans text-[12.5px] leading-[1.55] text-text-muted">
                  {meta.label}
                </div>
              </label>
            </div>
          )
        })}
      </div>
    </fieldset>
  )
}
