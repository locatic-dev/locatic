import { describe, expect, it } from 'vitest'

import { SEND_STATUS_ORDER } from '../contracts'
import { parseNewCampaignKind, parseSendStatus } from '../route-search'

describe('admin email search params', () => {
  it('reads the New page kind, defaulting to an update', () => {
    expect(parseNewCampaignKind('digest')).toBe('digest')
    expect(parseNewCampaignKind('update')).toBe('update')
    expect(parseNewCampaignKind('announcement')).toBe('update')
    expect(parseNewCampaignKind(undefined)).toBe('update')
  })

  it('accepts every send status and ignores anything else', () => {
    for (const status of SEND_STATUS_ORDER) {
      expect(parseSendStatus(status)).toBe(status)
    }
    expect(parseSendStatus('toString')).toBeUndefined()
    expect(parseSendStatus('')).toBeUndefined()
    expect(parseSendStatus(['failed'])).toBeUndefined()
  })
})
