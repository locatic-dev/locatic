// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { PrivacyVisibilitySettings } from '../privacy-visibility-settings'

const basePrivacy = {
  appearInPulse: true,
  cityVisibility: 'exact_city',
  commentHistoryVisibility: 'public',
  followGraphVisibility: 'public',
  likedProjectsVisibility: 'public',
  profileVisibility: 'public',
} as const

describe('PrivacyVisibilitySettings', () => {
  it('treats missing contribution visibility as checked', () => {
    render(
      <PrivacyVisibilitySettings
        privacy={basePrivacy}
        settingsRowClassName="row"
        onUpdate={vi.fn()}
      />,
    )

    expect(
      screen
        .getByRole('switch', { name: 'show contributions' })
        .getAttribute('aria-checked'),
    ).toBe('true')
  })

  it('persists private contribution visibility while preserving the full privacy object', async () => {
    const handleUpdate = vi.fn().mockResolvedValue(null)

    render(
      <PrivacyVisibilitySettings
        privacy={basePrivacy}
        settingsRowClassName="row"
        onUpdate={handleUpdate}
      />,
    )

    fireEvent.click(screen.getByRole('switch', { name: 'show contributions' }))

    await waitFor(() => {
      expect(handleUpdate).toHaveBeenCalledWith({
        ...basePrivacy,
        contributionsVisibility: 'private',
      })
    })
  })

  it('adds the default contribution visibility when updating another privacy row', async () => {
    const handleUpdate = vi.fn().mockResolvedValue(null)

    render(
      <PrivacyVisibilitySettings
        privacy={basePrivacy}
        settingsRowClassName="row"
        onUpdate={handleUpdate}
      />,
    )

    fireEvent.click(screen.getByRole('switch', { name: 'show liked projects' }))

    await waitFor(() => {
      expect(handleUpdate).toHaveBeenCalledWith({
        ...basePrivacy,
        contributionsVisibility: 'public',
        likedProjectsVisibility: 'private',
      })
    })
  })
})
