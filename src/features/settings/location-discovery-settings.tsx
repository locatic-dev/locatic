import { useRef, useState } from 'react'

import type { Doc } from '../../../convex/_generated/dataModel'
import { Switch } from '@/components/ui/switch'

export type CityVisibility = Doc<'users'>['privacy']['cityVisibility']

const CITY_VISIBILITY_OPTIONS: ReadonlyArray<{
  value: CityVisibility
  label: string
}> = [
  { value: 'exact_city', label: 'exact city' },
  { value: 'region_only', label: 'region only' },
  { value: 'hidden', label: 'hidden' },
]

/** One line per option: what visitors see under that setting (D8). */
export function getCityVisibilityDescription(
  value: CityVisibility,
  labels: { cityName: string | null; regionLabel: string | null },
) {
  switch (value) {
    case 'exact_city':
      return labels.cityName
        ? `visitors see ${labels.cityName}`
        : 'visitors see your city, region and country'
    case 'region_only':
      return labels.regionLabel
        ? `visitors see ${labels.regionLabel}`
        : 'visitors see your region and country, not your city'
    case 'hidden':
      return 'visitors see no location'
  }
}

/**
 * Keeps the control on the value just picked while its save runs, then hands
 * back to the live value (which reverts it when the save failed). Only the
 * latest pick clears the pending value, so quick arrow-key changes don't
 * flicker through older values.
 */
function usePendingSave<T>(value: T, save: (next: T) => Promise<unknown>) {
  const [pending, setPending] = useState<{ value: T } | null>(null)
  const latestRequest = useRef(0)

  const choose = async (next: T) => {
    const request = ++latestRequest.current
    setPending({ value: next })
    try {
      await save(next)
    } finally {
      if (latestRequest.current === request) {
        setPending(null)
      }
    }
  }

  return [pending ? pending.value : value, choose] as const
}

/**
 * "Where your city shows" (plan decision D8): exact city, region only or
 * hidden. Separate from discovery participation, which
 * `AppearInExploreSetting` controls. `onChange` saves and reports its own
 * errors; this only shows the pick while the save runs.
 */
export function CityVisibilitySettings({
  value,
  cityName,
  regionLabel,
  onChange,
  settingsRowClassName,
}: {
  value: CityVisibility
  cityName: string | null
  regionLabel: string | null
  onChange: (cityVisibility: CityVisibility) => Promise<unknown>
  settingsRowClassName: string
}) {
  const [selected, choose] = usePendingSave(value, onChange)

  return (
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend className="mb-0.5 p-0 text-label text-text">
        where your city shows
      </legend>
      <p className="m-0 font-sans text-xs text-text-faint">
        only an exact city lists you on city pages and in city counts.
      </p>
      {CITY_VISIBILITY_OPTIONS.map((option) => {
        const inputId = `privacy-city-visibility-${option.value}`
        const descriptionId = `${inputId}-description`

        return (
          <div key={option.value} className={settingsRowClassName}>
            {/* The whole text block selects the option: a 44px+ target. */}
            <label
              htmlFor={inputId}
              className="flex min-h-11 flex-1 cursor-pointer flex-col justify-center"
            >
              <span className="mb-0.5 text-label text-text">
                {option.label}
              </span>
              <span
                id={descriptionId}
                className="font-sans text-xs text-text-faint"
              >
                {getCityVisibilityDescription(option.value, {
                  cityName,
                  regionLabel,
                })}
              </span>
            </label>
            <input
              id={inputId}
              type="radio"
              name="privacy-city-visibility"
              value={option.value}
              aria-label={option.label}
              aria-describedby={descriptionId}
              checked={selected === option.value}
              onChange={(event) => {
                if (event.target.checked) {
                  void choose(option.value)
                }
              }}
              className="size-4 shrink-0 cursor-pointer accent-brand"
            />
          </div>
        )
      })}
    </fieldset>
  )
}

const APPEAR_IN_EXPLORE_LABEL = 'appear in explore and city pages'

/**
 * Discovery participation (`users.appearInExplore`, D8). Off takes the
 * viewer and their projects out of Explore, city pages and builder
 * suggestions without changing what their location discloses.
 */
export function AppearInExploreSetting({
  value,
  onChange,
  settingsRowClassName,
}: {
  value: boolean
  onChange: (appearInExplore: boolean) => Promise<unknown>
  settingsRowClassName: string
}) {
  const [checked, choose] = usePendingSave(value, onChange)

  return (
    <div className={settingsRowClassName}>
      {/* The whole text block toggles the switch: a 44px+ touch target. */}
      <label
        htmlFor="privacy-appear-in-explore"
        className="flex min-h-11 flex-1 cursor-pointer flex-col justify-center"
      >
        <span className="mb-0.5 text-label text-text">
          {APPEAR_IN_EXPLORE_LABEL}
        </span>
        <span className="font-sans text-xs text-text-faint">
          list you and your projects in explore, on city pages and in builder
          suggestions
        </span>
      </label>
      <Switch
        id="privacy-appear-in-explore"
        aria-label={APPEAR_IN_EXPLORE_LABEL}
        checked={checked}
        onCheckedChange={(next) => void choose(next)}
      />
    </div>
  )
}
