// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { LanguageBar } from '@/components/ui/language-bar'
import { ProfileContentSkeleton } from '../content-skeleton'
import { ProfileNetworkSection } from '../network-section'

// axe reports aria-label on an element with no role (aria-prohibited-attr):
// each labelled container needs a role that allows a name.
describe('labelled loading and summary containers', () => {
  it('announces the profile content skeleton as a named status', () => {
    render(<ProfileContentSkeleton />)

    expect(screen.getByRole('status', { name: 'loading content' })).toBeTruthy()
  })

  it('announces the loading network as a named status', () => {
    render(
      <ProfileNetworkSection
        activeTab="followers"
        emptyLabel="no followers yet."
        hasMore={false}
        items={[]}
        loading
        loadingMore={false}
        onChangeTab={vi.fn()}
        onLoadMore={vi.fn()}
        onSelectUser={vi.fn()}
      />,
    )

    expect(screen.getByRole('status', { name: 'loading network' })).toBeTruthy()
  })

  it('exposes the language summary as a named group', () => {
    render(
      <LanguageBar
        languages={[
          { name: 'TypeScript', bytes: 3 },
          { name: 'Rust', bytes: 1 },
        ]}
      />,
    )

    expect(
      screen.getByRole('group', { name: 'Project languages' }),
    ).toBeTruthy()
  })
})
