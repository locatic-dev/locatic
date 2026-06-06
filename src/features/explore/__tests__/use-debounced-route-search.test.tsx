// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useDebouncedRouteSearch } from '../use-debounced-route-search'

function Harness({
  onCommit,
  routeQuery,
}: {
  onCommit: (query: string) => void
  routeQuery: string
}) {
  const { debouncedSearchQuery, localSearchQuery, setLocalSearchQuery } =
    useDebouncedRouteSearch({
      onCommit,
      routeQuery,
    })

  return (
    <>
      <input
        aria-label="Search"
        value={localSearchQuery}
        onChange={(event) => setLocalSearchQuery(event.target.value)}
      />
      <output aria-label="Debounced">{debouncedSearchQuery}</output>
      <button type="button" onClick={() => setLocalSearchQuery('react')}>
        type react
      </button>
      <button type="button" onClick={() => setLocalSearchQuery('')}>
        clear
      </button>
    </>
  )
}

describe('useDebouncedRouteSearch', () => {
  function searchInput() {
    return screen.getByRole('textbox', {
      name: 'Search',
    }) as HTMLInputElement
  }

  it('does not restore stale route text during rapid clear/backspace flow', () => {
    vi.useFakeTimers()
    const onCommit = vi.fn()
    const { rerender } = render(
      <Harness onCommit={onCommit} routeQuery="react" />,
    )

    act(() => {
      screen.getByRole('button', { name: 'clear' }).click()
    })

    expect(searchInput().value).toBe('')

    act(() => {
      vi.advanceTimersByTime(250)
    })
    expect(onCommit).toHaveBeenLastCalledWith('')

    rerender(<Harness onCommit={onCommit} routeQuery="react" />)
    expect(searchInput().value).toBe('')

    rerender(<Harness onCommit={onCommit} routeQuery="" />)
    expect(searchInput().value).toBe('')

    vi.useRealTimers()
  })

  it('syncs external route query changes into the input', () => {
    vi.useFakeTimers()
    const onCommit = vi.fn()
    const { rerender } = render(<Harness onCommit={onCommit} routeQuery="" />)

    rerender(<Harness onCommit={onCommit} routeQuery="maps" />)

    expect(searchInput().value).toBe('maps')
    expect(screen.getByLabelText('Debounced').textContent).toBe('maps')

    vi.useRealTimers()
  })
})
