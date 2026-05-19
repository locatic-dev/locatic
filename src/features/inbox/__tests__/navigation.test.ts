import { describe, expect, it } from 'vitest'

import {
  getInboxDestinationSearch,
  getInboxTabForConversation,
} from '../navigation'

describe('inbox navigation helpers', () => {
  it('routes request conversations to the requests tab', () => {
    expect(getInboxTabForConversation(true)).toBe('requests')
  })

  it('routes established conversations to the inbox tab', () => {
    expect(getInboxTabForConversation(false)).toBe('inbox')
  })

  it('builds navigation search with the matching tab and conversation id', () => {
    expect(getInboxDestinationSearch('conv_123', true)).toEqual({
      conversation: 'conv_123',
      tab: 'requests',
    })
  })
})
