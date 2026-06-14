import { describe, expect, it } from 'vitest'

import { DEFAULT_REACTIONS } from '../../reactionConfigSeed'

describe('default reaction seed contract', () => {
  it('does not reintroduce retired update reaction targets', () => {
    for (const reaction of DEFAULT_REACTIONS) {
      expect(reaction.targetTypes).not.toContain('update')
    }
  })
})
