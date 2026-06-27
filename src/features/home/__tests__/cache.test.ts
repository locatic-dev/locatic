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
    expect(next?.page[0]?.projectSnapshot?.likesCount).toBe(5)
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

    expect(next?.page[0]?.projectSnapshot?.likesCount).toBe(7)
  })

  it('updates grouped preview targets even when the row project differs', () => {
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
            likesCount: 2,
          },
          previewTargets: [
            {
              kind: 'project',
              projectId: 'project_1',
              projectSnapshot: {
                likesCount: 2,
              },
            },
            {
              kind: 'project',
              project: {
                locatic: {
                  likesCount: 9,
                },
              },
              projectId: 'project_2',
              projectPreview: {
                locaticLikes: 9,
              },
              projectSnapshot: {
                likesCount: 9,
              },
            },
          ],
        },
      ],
    } as any

    const next = updateHomeFeedPayload(payload, 'project_2', true, new Set())
    const firstTarget = next?.page[0]?.previewTargets?.[0]
    const secondTarget = next?.page[0]?.previewTargets?.[1]

    expect(next?.page[0]?.projectSnapshot?.likesCount).toBe(2)
    expect(firstTarget && 'projectId' in firstTarget).toBe(true)
    expect(secondTarget && 'projectId' in secondTarget).toBe(true)
    expect(
      firstTarget && 'projectId' in firstTarget
        ? firstTarget.projectSnapshot.likesCount
        : null,
    ).toBe(2)
    expect(
      secondTarget && 'projectId' in secondTarget
        ? secondTarget.projectPreview?.locaticLikes
        : null,
    ).toBe(10)
    expect(
      secondTarget && 'projectId' in secondTarget
        ? secondTarget.projectSnapshot.likesCount
        : null,
    ).toBe(10)
  })
})
