import { describe, expect, it } from 'vitest'

import { updateHomeFeedPayload } from '../cache'

describe('updateHomeFeedPayload', () => {
  it('updates preview-backed like counts optimistically', () => {
    const payload = {
      continueCursor: '',
      isDone: true,
      page: [
        {
          _id: 'feed_1',
          projectId: 'project_1',
          project: {
            locatic: {
              likesCount: 4,
            },
          },
          projectPreview: {
            projectId: 'project_1',
            locaticLikes: 4,
          },
          projectSnapshot: {
            likesCount: 4,
          },
        },
      ],
    } as any

    const next = updateHomeFeedPayload(payload, 'project_1', true, new Set())

    expect(next?.page[0]?.projectPreview?.locaticLikes).toBe(5)
    expect(next?.page[0]?.projectSnapshot.likesCount).toBe(5)
  })

  it('updates snapshot-backed like counts when the live project is missing', () => {
    const payload = {
      continueCursor: '',
      isDone: true,
      page: [
        {
          _id: 'feed_1',
          projectId: 'project_1',
          project: null,
          projectPreview: null,
          projectSnapshot: {
            likesCount: 8,
          },
        },
      ],
    } as any

    const next = updateHomeFeedPayload(
      payload,
      'project_1',
      false,
      new Set(['project_1']),
    )

    expect(next?.page[0]?.projectSnapshot.likesCount).toBe(7)
  })
})
