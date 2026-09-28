// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ContributionGraph } from '../contribution-graph'

describe('ContributionGraph', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('exposes the contribution count in the accessible label', () => {
    render(
      <ContributionGraph
        totalContributions={42}
        weeks={[
          {
            days: [
              { count: 0, date: '2026-05-01' },
              { count: 1, date: '2026-05-02' },
              { count: 2, date: '2026-05-03' },
              { count: 3, date: '2026-05-04' },
              { count: 4, date: '2026-05-05' },
              { count: 0, date: '2026-05-06' },
              { count: 0, date: '2026-05-07' },
            ],
          },
        ]}
      />,
    )

    expect(
      screen.getByLabelText('42 GitHub contributions in the last year'),
    ).not.toBeNull()
  })

  it('renders a full 53-week grid even when only one week is provided', () => {
    render(
      <ContributionGraph
        weeks={[
          {
            days: Array.from({ length: 7 }, (_, index) => ({
              count: index,
              date: `2026-05-0${index + 1}`,
            })),
          },
        ]}
      />,
    )

    const graph = screen.getByRole('img', {
      name: 'GitHub contribution graph',
    })
    expect(graph.querySelectorAll('rect')).toHaveLength(53 * 7)
  })

  it('includes per-day tooltip text for contribution cells', () => {
    const { container } = render(
      <ContributionGraph
        weeks={[
          {
            days: [
              { count: 3, date: '2026-05-01' },
              { count: 0, date: '2026-05-02' },
              { count: 1, date: '2026-05-03' },
              { count: 0, date: '2026-05-04' },
              { count: 0, date: '2026-05-05' },
              { count: 0, date: '2026-05-06' },
              { count: 0, date: '2026-05-07' },
            ],
          },
        ]}
      />,
    )

    const titles = [...container.querySelectorAll('title')].map(
      (node) => node.textContent,
    )

    expect(titles).toContain('3 contributions on May 1, 2026')
    expect(titles).toContain('No contributions')
    expect(titles).toContain('1 contribution on May 3, 2026')
  })

  it('wraps the graph in a labelled, keyboard-focusable scroll region', () => {
    render(<ContributionGraph weeks={[]} />)

    const region = screen.getByRole('region', {
      name: 'GitHub contribution graph',
    })
    expect(region.tabIndex).toBe(0)
    expect(region.querySelector('svg')).not.toBeNull()
  })

  it('never draws cells smaller than the requested cell size', () => {
    render(<ContributionGraph cell={10} weeks={[]} />)
    const svg = screen.getByRole('img', { name: 'GitHub contribution graph' })
    const rects = [...svg.querySelectorAll('rect')]

    // The svg keeps its intrinsic width (no viewBox scaling via max-width), so
    // each cell renders at its attribute size and the region scrolls instead.
    expect(Number(svg.getAttribute('width'))).toBeGreaterThanOrEqual(53 * 10)
    expect(
      rects.every((rect) => Number(rect.getAttribute('width')) >= 10),
    ).toBe(true)
  })

  it('opens scrolled to the most recent weeks', () => {
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(660)

    render(<ContributionGraph weeks={[]} />)

    expect(
      screen.getByRole('region', { name: 'GitHub contribution graph' })
        .scrollLeft,
    ).toBe(660)
  })

  it('renders a loading skeleton when contribution data is syncing', () => {
    render(<ContributionGraph loading />)

    expect(screen.getByLabelText('Loading GitHub contributions')).not.toBeNull()
  })

  it('renders an unavailable message when contribution data is missing', () => {
    render(<ContributionGraph unavailable />)

    expect(
      screen.getByText(/contribution data is not available yet/i),
    ).not.toBeNull()
  })
})
