// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ProfileNetworkSection } from '../network-section'

const baseProps = {
  activeTab: 'followers' as const,
  emptyLabel: 'no followers yet.',
  hasMore: false,
  items: [],
  loadingMore: false,
  onChangeTab: vi.fn(),
  onLoadMore: vi.fn(),
  onSelectUser: vi.fn(),
}

describe('ProfileNetworkSection', () => {
  it('hides follow graph tabs when private', () => {
    render(<ProfileNetworkSection {...baseProps} isPrivate />)

    expect(screen.queryByRole('button', { name: 'followers' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'following' })).toBeNull()
    expect(
      screen.getByText('follow graph is private on this profile.'),
    ).toBeTruthy()
  })

  it('shows loading state before empty copy', () => {
    render(<ProfileNetworkSection {...baseProps} loading />)

    expect(screen.getByLabelText('loading network')).toBeTruthy()
    expect(screen.queryByText('no followers yet.')).toBeNull()
  })

  it('keeps public network tabs interactive', () => {
    const handleChangeTab = vi.fn()

    render(
      <ProfileNetworkSection {...baseProps} onChangeTab={handleChangeTab} />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'following' }))

    expect(handleChangeTab).toHaveBeenCalledWith('following')
  })
})
