import { describe, expect, it } from 'vitest'

import { getProjectLikeButtonStyle } from '../like-button-style'

describe('getProjectLikeButtonStyle', () => {
  it('keeps liked projects on the outline base with liked text color', () => {
    const style = getProjectLikeButtonStyle(true)

    expect(style.variant).toBe('monoOutline')
    expect(style.variant).not.toBe('brand')
    expect(style.className).toContain('text-liked')
    expect(style.className).not.toContain('text-brand')
  })

  it('keeps unliked projects on the outline base without liked text color', () => {
    const style = getProjectLikeButtonStyle(false)

    expect(style.variant).toBe('monoOutline')
    expect(style.className).not.toContain('text-liked')
  })
})
