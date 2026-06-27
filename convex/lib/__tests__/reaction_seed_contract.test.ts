import { describe, expect, it } from 'vitest'

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
    expect(likeReaction?.icon).toBe('heart-filled')
  })
})
