import { describe, expect, it } from 'vitest'

import { getHomeFeedActivityLabel } from '../activity-labels'

describe('getHomeFeedActivityLabel', () => {
  it('labels project posts as shipped activity', () => {
    expect(
      getHomeFeedActivityLabel({
        actorDisplayName: 'Saketha',
        eventType: 'project_posted',
      }),
    ).toBe('Saketha shipped this')
  })

  it('labels likes and comments as third-party activity', () => {
    expect(
      getHomeFeedActivityLabel({
        actorDisplayName: 'Saketha',
        eventType: 'project_liked',
      }),
    ).toBe('Saketha liked this')

    expect(
      getHomeFeedActivityLabel({
        actorDisplayName: 'Saketha',
        eventType: 'project_commented',
      }),
    ).toBe('Saketha commented here')
  })

  it('falls back to a neutral actor name when the snapshot is blank', () => {
    expect(
      getHomeFeedActivityLabel({
        actorDisplayName: '   ',
        eventType: 'update_broadcast',
      }),
    ).toBe('Someone updated this')
  })
})
