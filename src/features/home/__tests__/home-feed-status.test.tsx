// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { HomeFeedStatus } from '../home-feed-status'

afterEach(cleanup)

describe('HomeFeedStatus', () => {
  it('tells an account with no follows so, and points to explore', () => {
    const onExplore = vi.fn()
    render(
      <HomeFeedStatus state={{ kind: 'noFollows' }} onExplore={onExplore} />,
    )

    expect(
      screen.getByRole('heading', { name: "you're not following anyone yet." }),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'go to explore' }))
    expect(onExplore).toHaveBeenCalledOnce()
    // No suggestions were passed, so no discovery section appears.
    expect(screen.queryByRole('region')).toBeNull()
  })

  it('renders suggestions as a separate labelled section, outside the feed copy', () => {
    render(
      <HomeFeedStatus
        state={{ kind: 'noFollows' }}
        onExplore={vi.fn()}
        nearbyBuilders={<ul aria-label="suggested builders" />}
      />,
    )

    const section = screen.getByRole('region', { name: 'builders near you' })
    expect(section.textContent).toContain('suggestions, not part of your feed.')
    expect(
      section.querySelector('[aria-label="suggested builders"]'),
    ).toBeTruthy()
  })

  it('never says "not following anyone" to an account that follows people', () => {
    render(
      <HomeFeedStatus
        state={{ kind: 'quiet30d', followingCount: 3 }}
        onExplore={vi.fn()}
      />,
    )

    expect(
      screen.getByRole('heading', {
        name: 'nothing from the 3 people you follow in the last 30 days.',
      }),
    ).toBeTruthy()
    expect(document.body.textContent).toContain('last 30 days of activity')
    expect(document.body.textContent).not.toContain('not following anyone')
    expect(screen.getByRole('button', { name: 'go to explore' })).toBeTruthy()
  })

  it('keeps a recovery block with retry when the feed fails', () => {
    const onRetry = vi.fn()
    render(
      <HomeFeedStatus
        state={{ kind: 'error' }}
        onExplore={vi.fn()}
        onRetry={onRetry}
      />,
    )

    expect(screen.getByRole('alert').textContent).toContain(
      "couldn't load your feed.",
    )
    fireEvent.click(screen.getByRole('button', { name: 'retry' }))
    expect(onRetry).toHaveBeenCalledOnce()
    expect(document.body.textContent).not.toContain('not following anyone')
  })
})
