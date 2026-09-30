// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ExploreFilterSheet } from '../components/explore-filter-sheet'
import { getExploreCityHeadingId } from '../components/explore-rail'
import {
  RAIL_MEDIA_QUERY,
  useExploreFilterSheet,
} from '../use-explore-filter-sheet'

/** A controllable `matchMedia` for the rail breakpoint. */
class FakeRailQuery extends EventTarget {
  readonly media = RAIL_MEDIA_QUERY
  matches = false

  set(matches: boolean) {
    this.matches = matches
    this.dispatchEvent(new Event('change'))
  }
}

let railQuery: FakeRailQuery

function Harness() {
  const filterSheet = useExploreFilterSheet()
  return (
    <>
      <button type="button" onClick={() => filterSheet.openSheet('default')}>
        filters
      </button>
      <h2 id={getExploreCityHeadingId('rail')} tabIndex={-1}>
        city
      </h2>
      <ExploreFilterSheet {...filterSheet.sheetProps}>
        <p>sheet content</p>
      </ExploreFilterSheet>
    </>
  )
}

describe('useExploreFilterSheet', () => {
  beforeEach(() => {
    railQuery = new FakeRailQuery()
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => railQuery),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns focus to the button that opened it when it closes', async () => {
    render(<Harness />)
    const opener = screen.getByRole('button', { name: 'filters' })
    opener.focus()
    fireEvent.click(opener)

    const sheet = screen.getByRole('dialog', { name: 'explore filters' })
    expect(document.activeElement).toBe(sheet)

    fireEvent.keyDown(sheet, { key: 'Escape' })

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(document.activeElement).toBe(opener)
  })

  it('closes at the xl breakpoint and continues in the rail', async () => {
    render(<Harness />)
    const opener = screen.getByRole('button', { name: 'filters' })
    opener.focus()
    fireEvent.click(opener)
    expect(screen.getByRole('dialog', { name: 'explore filters' })).toBeTruthy()

    act(() => railQuery.set(true))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(document.activeElement).toBe(
      screen.getByRole('heading', { name: 'city' }),
    )
  })
})
