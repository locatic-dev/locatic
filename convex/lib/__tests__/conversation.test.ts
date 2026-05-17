import { describe, expect, test } from 'vitest'

import { buildConversationKey } from '../conversation'

describe('buildConversationKey', () => {
  test('orders ids lexicographically to produce a stable key', () => {
    expect(buildConversationKey('user_b', 'user_a')).toBe('user_a::user_b')
  })

  test('throws when a user tries to create a conversation with themselves', () => {
    expect(() => buildConversationKey('user_a', 'user_a')).toThrow(
      'Conversation participants must be different',
    )
  })
})
