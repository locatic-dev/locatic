// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
  AppearInExploreSetting,
  CityVisibilitySettings,
} from '../location-discovery-settings'

function deferred() {
  let resolve: () => void = () => {}
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

function radio(name: string) {
  return screen.getByRole('radio', { name }) as HTMLInputElement
}

describe('CityVisibilitySettings', () => {
  it('describes what visitors see under each option, from the viewer city', () => {
    render(
      <CityVisibilitySettings
        value="exact_city"
        cityName="Bengaluru, Karnataka, India"
        regionLabel="Karnataka, India"
        settingsRowClassName="row"
        onChange={vi.fn()}
      />,
    )

    expect(
      screen.getByRole('group', { name: 'where your city shows' }),
    ).toBeTruthy()
    expect(radio('exact city').checked).toBe(true)
    expect(radio('exact city').getAttribute('aria-describedby')).toBeTruthy()
    expect(
      screen.getByText('visitors see Bengaluru, Karnataka, India'),
    ).toBeTruthy()
    expect(screen.getByText('visitors see Karnataka, India')).toBeTruthy()
    expect(screen.getByText('visitors see no location')).toBeTruthy()
  })

  it('falls back to generic copy without a city', () => {
    render(
      <CityVisibilitySettings
        value="hidden"
        cityName={null}
        regionLabel={null}
        settingsRowClassName="row"
        onChange={vi.fn()}
      />,
    )

    expect(radio('hidden').checked).toBe(true)
    expect(
      screen.getByText('visitors see your city, region and country'),
    ).toBeTruthy()
    expect(
      screen.getByText('visitors see your region and country, not your city'),
    ).toBeTruthy()
  })

  it('saves the option picked from its row text and shows it while saving', async () => {
    const save = deferred()
    const onChange = vi.fn(() => save.promise)
    render(
      <CityVisibilitySettings
        value="exact_city"
        cityName="Bengaluru, Karnataka, India"
        regionLabel="Karnataka, India"
        settingsRowClassName="row"
        onChange={onChange}
      />,
    )

    fireEvent.click(screen.getByText('visitors see Karnataka, India'))

    expect(onChange).toHaveBeenCalledWith('region_only')
    expect(radio('region only').checked).toBe(true)
    // The caller reports a failed save and resolves; the live value, still
    // exact city here, takes over again once the save settles.
    save.resolve()
    await waitFor(() => expect(radio('exact city').checked).toBe(true))
  })
})

describe('AppearInExploreSetting', () => {
  it('toggles discovery participation from the switch and its row text', async () => {
    const onChange = vi.fn().mockResolvedValue(null)
    const { rerender } = render(
      <AppearInExploreSetting
        value
        settingsRowClassName="row"
        onChange={onChange}
      />,
    )

    const toggle = screen.getByRole('switch', {
      name: 'appear in explore and city pages',
    })
    expect(toggle.getAttribute('aria-checked')).toBe('true')

    fireEvent.click(toggle)
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(false))

    rerender(
      <AppearInExploreSetting
        value={false}
        settingsRowClassName="row"
        onChange={onChange}
      />,
    )
    await waitFor(() =>
      expect(toggle.getAttribute('aria-checked')).toBe('false'),
    )

    fireEvent.click(
      screen.getByText(
        'list you and your projects in explore, on city pages and in builder suggestions',
      ),
    )
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(true))
  })
})
