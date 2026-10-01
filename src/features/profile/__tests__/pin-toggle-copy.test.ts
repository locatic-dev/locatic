import { describe, expect, it } from 'vitest'

import { getPinToggleCopy } from '../state'

describe('getPinToggleCopy', () => {
  it('names the project and starts with the visible label', () => {
    for (const isPinned of [false, true]) {
      const copy = getPinToggleCopy({ isPinned, pending: false, repo: 'tiles' })

      expect(copy.accessibleName.startsWith(copy.label)).toBe(true)
      expect(copy.accessibleName).toContain('tiles')
    }
  })

  it('says what activating a pinned toggle does', () => {
    expect(
      getPinToggleCopy({ isPinned: true, pending: false, repo: 'tiles' }),
    ).toEqual({ label: 'pinned', accessibleName: 'pinned tiles, unpin' })
    expect(
      getPinToggleCopy({ isPinned: false, pending: false, repo: 'atlas' }),
    ).toEqual({ label: 'pin', accessibleName: 'pin atlas' })
  })

  it('gives each project its own name', () => {
    const names = ['tiles', 'atlas'].map(
      (repo) =>
        getPinToggleCopy({ isPinned: false, pending: false, repo })
          .accessibleName,
    )

    expect(new Set(names).size).toBe(2)
  })

  it('keeps the visible saving label in the name while pending', () => {
    expect(
      getPinToggleCopy({ isPinned: true, pending: true, repo: 'tiles' }),
    ).toEqual({ label: 'saving…', accessibleName: 'saving tiles' })
  })
})
