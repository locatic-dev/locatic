import { describe, expect, it } from 'vitest'

import {
  buildPostSearchText,
  getVisiblePostProject,
  normalizePostSearchQuery,
} from '../posts'

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
  actorId: 'user_1',
}

describe('post visibility helpers', () => {
  it('builds post search text from body, project, and hashtag topics', () => {
    expect(
      buildPostSearchText({
        body: 'Shipping the local graph',
        projectFullName: 'locatic/app',
        topics: ['React', 'maps'],
      }),
    ).toContain('react #react maps #maps')
  })

  it('normalizes hash-prefixed post search queries', () => {
    expect(normalizePostSearchQuery('  ##React  ')).toBe('react')
  })

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

  it('allows visible project posts when the project is not eligible for Explore', async () => {
    const project = {
      ...visibleProject,
      exploreOwner: { isEligible: false },
    }

    await expect(
      getVisiblePostProject(
        {
          db: createDb({ project_1: project, user_1: activeOwner }),
        } as never,
        post as never,
      ),
    ).resolves.toEqual(project)
  })

  it.each(['recoverable', 'expired', 'purged'] as const)(
    'checks the live collaborator author when their account is %s',
    async (status) => {
      const now = Date.now()
      const author = {
        _id: 'author',
        deletedAt: now - 1,
        purgeAfter: status === 'recoverable' ? now + 86_400_000 : now - 1,
        purgedAt: status === 'purged' ? now - 1 : null,
      }
      const result = await getVisiblePostProject(
        {
          db: createDb({
            project_1: visibleProject,
            user_1: activeOwner,
            author,
          }),
        } as never,
        { ...post, actorId: 'author' } as never,
      )
      expect(result).toEqual(status === 'recoverable' ? visibleProject : null)
    },
  )

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
