import { describe, expect, it } from 'vitest'
import type { Id } from '../../../../convex/_generated/dataModel'
import type {
  ProjectCardPreview,
  ViewerLikedProjectIdsPayload,
} from '@/features/contracts'
import type { ExploreFeedPayload } from '../types'
import {
  updateExploreFeedPayload,
  updateLikedProjectIdsPayload,
} from '../cache'

const projectId = 'project_1' as Id<'projects'>

function createProject(likes: number): ProjectCardPreview {
  return {
    projectId,
    ownerUserId: 'user_1' as Id<'users'>,
    fullName: 'owner/repo',
    owner: 'owner',
    repo: 'repo',
    description: null,
    primaryLanguage: 'TypeScript',
    languages: [],
    githubStars: 1,
    locaticLikes: likes,
    commentsCount: 0,
    lastCommitAt: 1,
    updatedAt: 1,
    authorName: 'Owner',
    authorHandle: 'owner',
    authorAvatarUrl: null,
    cityLabel: null,
    cityVisibilityState: 'unset',
  }
}

describe('explore cache helpers', () => {
  it('increments and decrements project like counts without going below zero', () => {
    const payload: ExploreFeedPayload = {
      scope: 'custom',
      appliedCityIds: [],
      isCityFiltered: true,
      projects: [createProject(1)],
    }

    expect(
      updateExploreFeedPayload(payload, projectId, false, true)?.projects[0]
        ?.locaticLikes,
    ).toBe(2)
    expect(
      updateExploreFeedPayload(payload, projectId, true, false)?.projects[0]
        ?.locaticLikes,
    ).toBe(0)
    expect(
      updateExploreFeedPayload(
        { ...payload, projects: [createProject(0)] },
        projectId,
        true,
        false,
      )?.projects[0]?.locaticLikes,
    ).toBe(0)
  })

  it('updates the viewer liked project id cache', () => {
    const payload: ViewerLikedProjectIdsPayload = {
      viewerId: 'user_1' as Id<'users'>,
      likedProjectIds: [],
    }

    const liked = updateLikedProjectIdsPayload(payload, projectId, true)
    expect(liked?.likedProjectIds).toEqual([projectId])

    const unliked = updateLikedProjectIdsPayload(liked, projectId, false)
    expect(unliked?.likedProjectIds).toEqual([])
  })
})
