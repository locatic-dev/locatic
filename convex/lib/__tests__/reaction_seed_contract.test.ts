import { describe, expect, it } from 'vitest'

import {
  normalizeReactionEmoji,
  sanitizeReactionConfigForWrite,
} from '../reaction_config'
import { DEFAULT_REACTIONS } from '../../reactionConfigSeed'

describe('default reaction seed contract', () => {
  it('does not reintroduce retired update reaction targets', () => {
    for (const reaction of DEFAULT_REACTIONS) {
      expect(reaction.targetTypes).not.toContain('update')
    }
  })

  it('keeps like as the only heart reaction', () => {
    const reactionKeys = DEFAULT_REACTIONS.map((reaction) => reaction.key)
    const likeReaction = DEFAULT_REACTIONS.find(
      (reaction) => reaction.key === 'like',
    )

    expect(reactionKeys).not.toContain('heart')
    expect(likeReaction?.emoji).toBe('❤️')
    expect('icon' in (likeReaction ?? {})).toBe(false)
  })

  it('normalizes legacy icon slugs into emoji glyphs', () => {
    expect(normalizeReactionEmoji('heart-filled')).toBe('❤️')
    expect(normalizeReactionEmoji('heart')).toBe('❤️')
    expect(normalizeReactionEmoji('rocket')).toBe('🚀')
    expect(normalizeReactionEmoji('flame')).toBe('🔥')
    expect(normalizeReactionEmoji('eye')).toBe('👀')
    expect(normalizeReactionEmoji('party-popper')).toBe('🎉')
    expect(normalizeReactionEmoji('✨')).toBe('✨')
  })

  it('sanitizes default rows by dropping icon and normalizing emoji', () => {
    const sanitized = sanitizeReactionConfigForWrite({
      key: 'celebrate',
      label: 'Celebrate',
      emoji: 'party-popper',
      icon: 'party-popper',
      color: '#f472b6',
      targetTypes: ['project', 'post', 'comment'],
      isActive: true,
      sortOrder: 60,
      createdAt: 1,
      updatedAt: 2,
    })

    expect(sanitized).toEqual({
      key: 'celebrate',
      label: 'Celebrate',
      emoji: '🎉',
      color: '#f472b6',
      targetTypes: ['project', 'post', 'comment'],
      isActive: true,
      sortOrder: 60,
      createdAt: 1,
      updatedAt: 2,
    })
    expect('icon' in sanitized).toBe(false)
  })

  it('sanitizes non-default rows by dropping icon without losing data', () => {
    const sanitized = sanitizeReactionConfigForWrite({
      key: 'shipit',
      label: 'Ship It',
      emoji: '🚢',
      icon: 'custom-ship',
      targetTypes: ['project'],
      isActive: false,
      sortOrder: 90,
      createdAt: 3,
      updatedAt: 4,
    })

    expect(sanitized).toEqual({
      key: 'shipit',
      label: 'Ship It',
      emoji: '🚢',
      targetTypes: ['project'],
      isActive: false,
      sortOrder: 90,
      createdAt: 3,
      updatedAt: 4,
    })
    expect('icon' in sanitized).toBe(false)
  })
})
