// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { PropsWithChildren } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ProjectCard, type ProjectCardData } from '../project-card'

const navigate = vi.fn()
const preloadRoute = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    className,
    to,
    hash,
    ...props
  }: PropsWithChildren<{
    className?: string
    to?: string
    hash?: string
    'aria-label'?: string
    'data-card-cover'?: string
  }>) => (
    <a
      href={`${to ?? '#'}${hash ? `#${hash}` : ''}`}
      className={className}
      aria-label={props['aria-label']}
      data-card-cover={props['data-card-cover']}
    >
      {children}
    </a>
  ),
  useRouter: () => ({
    navigate,
    preloadRoute,
  }),
}))

const NOW = Date.UTC(2026, 8, 20, 12)
const DAY = 24 * 60 * 60 * 1000

const project = {
  id: 'project_1',
  owner: 'locatic',
  repo: 'app',
  description: 'Developer activity platform',
  lang: 'TypeScript',
  githubStars: 12,
  commentsCount: 2,
  authorName: 'Avi',
  authorHandle: 'avinash',
} satisfies ProjectCardData

/** Tabs from the start of the document and counts stops inside the card. */
async function countCardTabStops(container: HTMLElement) {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  const stops: Element[] = []
  for (let index = 0; index < 20; index += 1) {
    await user.tab()
    const active = document.activeElement
    if (!active || active === document.body || !container.contains(active)) {
      break
    }
    stops.push(active)
  }
  return stops
}

describe('ProjectCard', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('opens the project through one cover link and gives each visible action its own tab stop', async () => {
    const { container } = render(
      <ProjectCard
        project={project}
        projectLink={{ owner: 'locatic', repo: 'app' }}
        authorLink={{ username: 'avinash' }}
        onDismiss={vi.fn()}
        showActions={false}
      />,
    )

    const stops = await countCardTabStops(container)

    // cover link + author link + dismiss + comment action
    expect(stops).toHaveLength(4)
    expect(
      stops.map((stop) => stop.getAttribute('aria-label') ?? stop.textContent),
    ).toEqual([
      "Open Avi's profile",
      'locatic/app',
      'Dismiss locatic/app',
      '2 comments',
    ])
    expect(
      container.querySelectorAll('[data-card-cover]'),
      'exactly one cover link',
    ).toHaveLength(1)
    expect(
      container.querySelector('[data-card-cover] a, [data-card-cover] button'),
      'no control nested inside the cover link',
    ).toBeNull()
  })

  it('keeps the card itself out of the tab order', async () => {
    const { container } = render(
      <ProjectCard
        project={{ ...project, commentsCount: 0 }}
        projectLink={{ owner: 'locatic', repo: 'app' }}
        showActions={false}
      />,
    )

    const stops = await countCardTabStops(container)

    expect(stops).toHaveLength(2)
    expect(stops[0]?.getAttribute('data-card-cover')).not.toBeNull()
  })

  it('still offers a comment action when a project has no comments', () => {
    const onComment = vi.fn()
    render(
      <ProjectCard
        project={{ ...project, commentsCount: 0 }}
        onComment={onComment}
      />,
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'start the conversation' }),
    )

    expect(onComment).toHaveBeenCalledTimes(1)
  })

  it('links the comment action to the project comments when no handler is given', () => {
    render(
      <ProjectCard
        project={{ ...project, commentsCount: 0 }}
        projectLink={{ owner: 'locatic', repo: 'app' }}
      />,
    )

    expect(
      screen
        .getByRole('link', { name: 'start the conversation' })
        .getAttribute('href'),
    ).toBe('/project/$owner/$repo#comments')
  })

  it('hides zero counts', () => {
    render(
      <ProjectCard
        project={{
          ...project,
          githubStars: 0,
          postsCount: 0,
          forksCount: 0,
          commentsCount: 3,
        }}
      />,
    )

    expect(screen.queryByText(/GitHub stars/)).toBeNull()
    expect(screen.queryByText(/forks/)).toBeNull()
    expect(screen.queryByText(/\bposts?\b/)).toBeNull()
    expect(screen.getByText('3 comments')).toBeTruthy()
  })

  it('does not trigger navigation from card actions', () => {
    const onDismiss = vi.fn()
    const onComment = vi.fn()

    render(
      <ProjectCard
        project={project}
        projectLink={{ owner: 'locatic', repo: 'app' }}
        onDismiss={onDismiss}
        onComment={onComment}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }))
    fireEvent.click(screen.getByRole('button', { name: '2 comments' }))

    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(onComment).toHaveBeenCalledTimes(1)
    expect(navigate).not.toHaveBeenCalled()
  })

  it.each([
    [
      'a release',
      { kind: 'release' as const, at: NOW - 3 * DAY, label: 'v1.2' },
      'released v1.2 · 3d ago',
    ],
    [
      'a post',
      { kind: 'post' as const, at: NOW - 2 * 3_600_000 },
      'posted · 2h ago',
    ],
    ['a push', { kind: 'repo' as const, at: NOW - 5 * DAY }, 'pushed · 5d ago'],
  ])('names the latest update for %s', (_name, latestUpdate, copy) => {
    const { rerender } = render(
      <ProjectCard project={{ ...project, latestUpdate }} />,
    )

    // In the identity line: the age on screen, the kind for screen readers.
    expect(screen.getByTitle(copy).textContent).toBe(copy)

    rerender(
      <ProjectCard
        project={{ ...project, latestUpdate }}
        authorPlacement="none"
      />,
    )
    expect(screen.getByText(copy)).toBeTruthy()
  })

  it('keeps an old push relative in the identity line and dated elsewhere', () => {
    const latestUpdate = { kind: 'repo' as const, at: Date.UTC(2026, 2, 3, 12) }
    const { rerender } = render(
      <ProjectCard project={{ ...project, latestUpdate }} />,
    )

    // On screen "6mo ago", like the rest of the feed; the title keeps the date.
    expect(screen.getByTitle('pushed · Mar 3, 2026').textContent).toBe(
      'pushed · 6mo ago',
    )

    rerender(
      <ProjectCard
        project={{ ...project, latestUpdate }}
        authorPlacement="none"
      />,
    )
    expect(screen.getByText('pushed · Mar 3, 2026')).toBeTruthy()
  })

  it.each([
    [
      'fresh',
      { kind: 'fresh' as const, at: NOW - 3 * DAY, hasReadme: true },
      'updated 3d ago',
    ],
    [
      'stale',
      { kind: 'stale' as const, at: NOW - 12 * DAY, hasReadme: true },
      'last updated 1w ago',
    ],
    [
      'never synced',
      { kind: 'never' as const, at: null, hasReadme: false },
      'not synced yet · no README',
    ],
    [
      'fresh without a README',
      { kind: 'fresh' as const, at: NOW - DAY, hasReadme: false },
      'updated 1d ago · no README',
    ],
  ])('shows %s sync freshness to visitors', (_name, syncStatus, copy) => {
    render(<ProjectCard project={{ ...project, syncStatus }} />)

    expect(screen.getByText(copy)).toBeTruthy()
    expect(screen.queryByText(/refresh failed/)).toBeNull()
  })

  it('leaves sync freshness to the project page in the row variant', () => {
    render(
      <ProjectCard
        variant="row"
        project={{
          ...project,
          syncStatus: { kind: 'fresh', at: NOW - DAY, hasReadme: false },
        }}
      />,
    )

    expect(screen.queryByText('updated 1d ago · no README')).toBeNull()
  })

  it('shows the owner a failed refresh with its reason and a retry control', () => {
    const onRetrySync = vi.fn()
    render(
      <ProjectCard
        project={{
          ...project,
          syncStatus: {
            kind: 'failed',
            at: NOW - 4 * DAY,
            hasReadme: true,
            error: 'GitHub request failed: 404',
          },
        }}
        onRetrySync={onRetrySync}
      />,
    )

    expect(screen.getByRole('status').textContent).toBe(
      'last refresh failed: GitHub request failed: 404retry',
    )
    fireEvent.click(screen.getByRole('button', { name: 'retry' }))
    expect(onRetrySync).toHaveBeenCalledTimes(1)
  })

  it('links an exact-city owner to the city page and leaves a region label as text', () => {
    const { rerender } = render(
      <ProjectCard
        project={{
          ...project,
          city: 'Bengaluru, Karnataka, India',
          cityId: 'city_blr',
        }}
      />,
    )

    expect(
      screen.getByRole('link', { name: 'Bengaluru' }).getAttribute('href'),
    ).toBe('/c/$slug')

    rerender(
      <ProjectCard
        project={{ ...project, city: 'Karnataka, India', cityId: null }}
      />,
    )

    // The identity line shows the first part; the full label is the title.
    expect(screen.getByTitle('Karnataka, India').textContent).toBe('Karnataka')
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('keeps place and age together so no wrapped line starts on a separator', () => {
    render(
      <ProjectCard
        project={{
          ...project,
          city: 'Bengaluru, Karnataka, India',
          cityId: 'city_blr',
          latestUpdate: { kind: 'repo', at: NOW - 5 * DAY },
        }}
      />,
    )

    const group = screen.getByTitle('pushed · 5d ago').parentElement!
    expect(
      group.contains(screen.getByRole('link', { name: 'Bengaluru' })),
    ).toBe(true)
    // The class is the contract: the group's leading dot hides once a narrow
    // card puts the group on its own line.
    const [leadingDot] = group.children
    expect(leadingDot?.textContent).toBe('·')
    expect(leadingDot?.getAttribute('class')).toContain('@max-xl:hidden')
  })

  it('renders trailing actions from the action slot', () => {
    render(
      <ProjectCard
        project={project}
        actionSlot={<a href="/sign-in">sign in to react, follow or save</a>}
      />,
    )

    expect(
      screen.getByRole('link', { name: 'sign in to react, follow or save' }),
    ).toBeTruthy()
  })

  it('shows collaboration statuses and leaves the others out', () => {
    const { rerender } = render(
      <ProjectCard project={{ ...project, buildStatus: 'open_to_collab' }} />,
    )
    expect(screen.getByText('open to collab')).toBeTruthy()

    rerender(
      <ProjectCard project={{ ...project, buildStatus: 'building_solo' }} />,
    )
    expect(screen.queryByText('building solo')).toBeNull()
  })

  it('shows the primary language by name instead of a proportion bar', () => {
    render(
      <ProjectCard
        project={{
          ...project,
          lang: undefined,
          languages: [
            { name: 'TypeScript', bytes: 800 },
            { name: 'CSS', bytes: 200 },
          ],
        }}
      />,
    )

    expect(screen.getByText('TypeScript')).toBeTruthy()
    expect(screen.queryByText('CSS')).toBeNull()
    expect(screen.queryByText(/%$/)).toBeNull()
  })

  it('names the primary language from `lang`', () => {
    render(<ProjectCard project={project} />)

    expect(screen.getByText('TypeScript')).toBeTruthy()
    expect(screen.queryByText('100%')).toBeNull()
  })

  it('leads with the author when the author is in the header', () => {
    render(
      <ProjectCard
        project={{ ...project, city: 'Bengaluru, Karnataka, India' }}
        authorPlacement="header"
        showFullCity
        authorLink={{ username: 'avinash' }}
        showActions={false}
      />,
    )

    const profile = screen.getByRole('link', { name: "Open Avi's profile" })
    const title = screen.getByText('locatic/app')
    expect(
      profile.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(screen.getByText('Bengaluru, Karnataka, India')).toBeTruthy()
  })

  it('renders no author with authorPlacement="none"', () => {
    render(
      <ProjectCard
        project={project}
        authorPlacement="none"
        authorLink={{ username: 'avinash' }}
        showActions={false}
      />,
    )

    expect(
      screen.queryByRole('link', { name: "Open Avi's profile" }),
    ).toBeNull()
    expect(screen.queryByText('Avi')).toBeNull()
  })

  it.each([
    ['23h ago', NOW - 23 * 3_600_000, true],
    ['25h ago', NOW - 25 * 3_600_000, false],
  ])('marks a builder active in the last 24h (%s)', (_name, at, expected) => {
    render(
      <ProjectCard
        project={{ ...project, latestUpdate: { kind: 'repo', at } }}
        authorLink={{ username: 'avinash' }}
      />,
    )

    expect(Boolean(screen.queryByTitle('active in the last 24h'))).toBe(
      expected,
    )
  })

  it('renders ages and the live ring only after hydration, without a mismatch', async () => {
    const card = (
      <ProjectCard
        project={{
          ...project,
          latestUpdate: { kind: 'repo', at: NOW - 3_600_000 },
          syncStatus: { kind: 'fresh', at: NOW - DAY, hasReadme: true },
        }}
        authorLink={{ username: 'avinash' }}
      />
    )
    const container = document.createElement('div')
    container.innerHTML = renderToString(card)
    document.body.append(container)

    // The server's clock knows nothing the client can match.
    expect(container.textContent).not.toContain('1h ago')
    expect(container.textContent).not.toContain('updated 1d ago')
    expect(
      container.querySelector('[title="active in the last 24h"]'),
    ).toBeNull()

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const recoverable = vi.fn()
    // A client clock a tick later than the server's.
    vi.setSystemTime(NOW + 5_000)
    const root = await act(async () =>
      hydrateRoot(container, card, { onRecoverableError: recoverable }),
    )

    expect(recoverable).not.toHaveBeenCalled()
    expect(consoleError).not.toHaveBeenCalled()
    expect(container.textContent).toContain('1h ago')
    expect(container.textContent).toContain('updated 1d ago')
    expect(
      container.querySelector('[title="active in the last 24h"]'),
    ).not.toBeNull()

    act(() => root.unmount())
    container.remove()
    consoleError.mockRestore()
  })

  it('does not offer message on a card', () => {
    render(
      <ProjectCard
        project={project}
        onFollow={vi.fn()}
        onToggleSave={vi.fn()}
      />,
    )

    expect(screen.queryByRole('button', { name: /message/i })).toBeNull()
  })

  it('shows follow as the primary action until followed', () => {
    const onFollow = vi.fn()
    const { rerender } = render(
      <ProjectCard project={project} onFollow={onFollow} />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'follow' }))
    expect(onFollow).toHaveBeenCalledTimes(1)

    rerender(
      <ProjectCard
        project={{ ...project, followed: true }}
        onFollow={onFollow}
      />,
    )
    expect(screen.queryByRole('button', { name: 'follow' })).toBeNull()
    expect(screen.getByRole('button', { name: 'following' })).toBeTruthy()
  })

  it('places project reactions in the card with no separate like control', () => {
    render(
      <ProjectCard
        project={project}
        reactionSlot={<div>project reactions</div>}
      />,
    )

    expect(screen.getByText('project reactions')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^like/i })).toBeNull()
  })

  it('renders a project-level control without navigating the card', () => {
    const onPin = vi.fn()

    render(
      <ProjectCard
        project={project}
        projectLink={{ owner: 'locatic', repo: 'app' }}
        topLeftSlot={
          <button type="button" onClick={onPin} aria-label="Unpin from profile">
            pinned
          </button>
        }
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Unpin from profile' }))

    expect(onPin).toHaveBeenCalledTimes(1)
    expect(navigate).not.toHaveBeenCalled()
  })

  it('offers save to a signed-in viewer and reports saved state', () => {
    const onToggleSave = vi.fn()
    const { rerender } = render(
      <ProjectCard
        project={project}
        projectLink={{ owner: 'locatic', repo: 'app' }}
        onToggleSave={onToggleSave}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'save' }))
    expect(onToggleSave).toHaveBeenCalledTimes(1)
    expect(navigate).not.toHaveBeenCalled()

    rerender(
      <ProjectCard
        project={project}
        projectLink={{ owner: 'locatic', repo: 'app' }}
        onToggleSave={onToggleSave}
        saved
        savePending
      />,
    )
    const saved = screen.getByRole('button', { name: 'saved' })
    expect((saved as HTMLButtonElement).disabled).toBe(true)
  })

  it('shows no save control without a handler', () => {
    render(<ProjectCard project={project} saved />)

    expect(screen.queryByRole('button', { name: /^save/ })).toBeNull()
  })
})
