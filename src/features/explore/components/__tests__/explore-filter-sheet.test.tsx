// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ExploreFilterSheet } from '../explore-filter-sheet'
import { getExploreCityInputId } from '../explore-rail'

function Sheet({ focus }: { focus: 'default' | 'city' }) {
  return (
    <ExploreFilterSheet open onOpenChange={() => {}} focus={focus}>
      <label>
        Add a city filter
        <input id={getExploreCityInputId('sheet')} />
      </label>
    </ExploreFilterSheet>
  )
}

describe('ExploreFilterSheet', () => {
  it('opens as a dialog named explore filters and focuses the sheet, not a field', () => {
    render(<Sheet focus="default" />)

    const sheet = screen.getByRole('dialog', { name: 'explore filters' })
    expect(document.activeElement).toBe(sheet)
  })

  it('lands on the city field when opened to choose another city', () => {
    render(<Sheet focus="city" />)

    expect(document.activeElement).toBe(
      screen.getByLabelText('Add a city filter'),
    )
  })
  it('lets the caller take over focus on close', async () => {
    const onCloseAutoFocus = vi.fn((event: Event) => event.preventDefault())
    const { rerender } = render(
      <ExploreFilterSheet
        open
        onOpenChange={() => {}}
        focus="default"
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <p>content</p>
      </ExploreFilterSheet>,
    )

    rerender(
      <ExploreFilterSheet
        open={false}
        onOpenChange={() => {}}
        focus="default"
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <p>content</p>
      </ExploreFilterSheet>,
    )

    await waitFor(() => expect(onCloseAutoFocus).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
