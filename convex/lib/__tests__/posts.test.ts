import { describe, expect, it } from 'vitest'

import { getVisiblePostProject } from '../posts'

function createDb(docs: Record<string, unknown>) {
  return {
    get: async (id: string) => docs[id] ?? null,
  }
}

const visibleProject = {
  _id: 'project_1',
  ownerId: 'user_1',
  locatic: { isVisible: true },
  exploreOwner: { isEligible: true },
}

const activeOwner = {
  _id: 'user_1',
  deletedAt: null,
  deactivatedAt: null,
}

const post = {
  _id: 'post_1',
  projectId: 'project_1',
}

describe('post visibility helpers', () => {
  it('allows posts whose project and owner are public and active', async () => {
    await expect(
      getVisiblePostProject(
        {
          db: createDb({ project_1: visibleProject, user_1: activeOwner }),
        } as never,
        post as never,
      ),
    ).resolves.toEqual(visibleProject)
  })

  it('hides posts when the parent project is hidden', async () => {
    await expect(
      getVisiblePostProject(
        {
          db: createDb({
            project_1: {
              ...visibleProject,
              locatic: { isVisible: false },
            },
            user_1: activeOwner,
          }),
        } as never,
        post as never,
      ),
    ).resolves.toBeNull()
  })

  it('hides posts when the owner account is inactive', async () => {
    await expect(
      getVisiblePostProject(
        {
          db: createDb({
            project_1: visibleProject,
            user_1: { ...activeOwner, deactivatedAt: Date.now() },
          }),
        } as never,
        post as never,
      ),
    ).resolves.toBeNull()
  })
})
