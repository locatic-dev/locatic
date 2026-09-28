import { describe, expect, it } from 'vitest'

import {
  getInboxComposeSearch,
  getInboxDestinationSearch,
  getInboxTabForConversation,
  getInboxTabForStatus,
} from '../navigation'

describe('inbox navigation helpers', () => {
  it('files only incoming requests under requests', () => {
    expect(getInboxTabForStatus('request')).toBe('requests')
    expect(getInboxTabForStatus('pending')).toBe('inbox')
    expect(getInboxTabForStatus('active')).toBe('inbox')
  })

  it('opens an incoming request from the other person under requests', () => {
    expect(
      getInboxTabForConversation(
        { isRequest: true, lastMessage: { senderId: 'user_other' } },
        'user_other',
      ),
    ).toBe('requests')
  })

  it('opens an outgoing pending request in the main inbox', () => {
    expect(
      getInboxTabForConversation(
        { isRequest: true, lastMessage: { senderId: 'user_viewer' } },
        'user_other',
      ),
    ).toBe('inbox')
  })

  it('opens an accepted conversation in the main inbox', () => {
    expect(
      getInboxTabForConversation(
        { isRequest: false, lastMessage: { senderId: 'user_other' } },
        'user_other',
      ),
    ).toBe('inbox')
  })

  it('builds navigation search with the given tab and conversation id', () => {
    expect(getInboxDestinationSearch('conv_123', 'requests')).toEqual({
      compose: null,
      conversation: 'conv_123',
      tab: 'requests',
    })
  })

  it('builds draft compose navigation without creating a conversation id', () => {
    expect(getInboxComposeSearch('user_123')).toEqual({
      compose: 'user_123',
      conversation: null,
      tab: 'inbox',
    })
  })
})
