import { describe, expect, it } from 'vitest'

import {
  isCommentPubliclyInteractable,
  isProjectPubliclyInteractable,
} from '../project_access'

function createDb(docs: Record<string, unknown>) {
  return {
    get: async (id: string) => docs[id] ?? null,
    normalizeId: (_table: string, id: string) => id,
  }
}

const activeOwner = {
  _id: 'user_1',
  deactivatedAt: null,
  deletedAt: null,
}

const visibleProject = {
  _id: 'project_1',
  locatic: { isVisible: true },
  ownerId: 'user_1',
}

describe('project access helpers', () => {
  it('allows visible projects owned by active users even when Explore-ineligible', async () => {
    await expect(
      isProjectPubliclyInteractable(
        {
          db: createDb({
            project_1: {
              ...visibleProject,
              exploreOwner: { isEligible: false },
            },
            user_1: activeOwner,
          }),
        } as never,
        {
          ...visibleProject,
          exploreOwner: { isEligible: false },
        } as never,
      ),
    ).resolves.toBe(true)
  })

  it('rejects hidden projects and inactive owners', async () => {
    await expect(
      isProjectPubliclyInteractable(
        {
          db: createDb({ user_1: activeOwner }),
        } as never,
        {
          ...visibleProject,
          locatic: { isVisible: false },
        } as never,
      ),
    ).resolves.toBe(false)

    await expect(
      isProjectPubliclyInteractable(
        {
          db: createDb({
            user_1: { ...activeOwner, deactivatedAt: Date.now() },
          }),
        } as never,
        visibleProject as never,
      ),
    ).resolves.toBe(false)
  })

  it('allows comments on visible project targets when the owner is active', async () => {
    await expect(
      isCommentPubliclyInteractable(
        {
          db: createDb({
            project_1: visibleProject,
            user_1: activeOwner,
          }),
        } as never,
        {
          isDeleted: false,
          targetId: 'project_1',
          targetType: 'project',
        } as never,
      ),
    ).resolves.toBe(true)
  })
})
