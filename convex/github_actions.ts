'use node'

import { createClerkClient } from '@clerk/backend'
import { ConvexError, v } from 'convex/values'

import { internal } from './_generated/api'
import { action, internalAction } from './_generated/server'
import { requireIdentity } from './lib/auth'

async function getClerkClient() {
  if (!process.env.CLERK_SECRET_KEY) {
    throw new Error('CLERK_SECRET_KEY is required')
  }

  return createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY })
}

async function getGithubAccessToken(clerkId: string) {
  const clerkClient = await getClerkClient()
  const response = await clerkClient.users.getUserOauthAccessToken(
    clerkId,
    'github',
  )
  const accessToken = response.data[0]?.token ?? ''
  const scopes = response.data[0]?.scopes ?? []

  if (!accessToken) {
    throw new ConvexError('GitHub access token not found')
  }

  return { accessToken, scopes }
}

async function githubRequest<T>(
  url: string,
  accessToken: string,
  init?: RequestInit,
) {
  const headers = new Headers(init?.headers)
  headers.set('Accept', 'application/vnd.github+json')
  headers.set('Authorization', `Bearer ${accessToken}`)
  headers.set('X-GitHub-Api-Version', '2022-11-28')

  const response = await fetch(`https://api.github.com${url}`, {
    ...init,
    headers,
  })

  if (!response.ok) {
    throw new ConvexError(`GitHub request failed: ${response.status}`)
  }

  return (await response.json()) as T
}

async function githubNoContentRequest(
  url: string,
  accessToken: string,
  init: RequestInit,
) {
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/vnd.github+json')
  headers.set('Authorization', `Bearer ${accessToken}`)
  headers.set('X-GitHub-Api-Version', '2022-11-28')

  const response = await fetch(`https://api.github.com${url}`, {
    ...init,
    headers,
  })

  if (response.ok || response.status === 304) {
    return
  }

  throw new ConvexError(`GitHub request failed: ${response.status}`)
}

type GithubRepository = {
  id: number
  full_name: string
  name: string
  description: string | null
  html_url: string
  homepage: string | null
  language: string | null
  topics?: string[]
  stargazers_count: number
  pushed_at: string
}

function mapGithubRepository(repository: GithubRepository) {
  const lastCommitAt = new Date(repository.pushed_at).getTime()
  return {
    repoId: repository.id,
    fullName: repository.full_name,
    name: repository.name,
    description: repository.description,
    githubUrl: repository.html_url,
    projectUrl: repository.homepage,
    primaryLanguage: repository.language,
    topics: repository.topics ?? [],
    stargazersCount: repository.stargazers_count,
    lastCommitAt,
    lastMetadataSyncedAt: Date.now(),
    readmePreview: repository.description,
  }
}

export const listRepositories = action({
  args: {},
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx)
    const viewer = await ctx.runQuery(internal.users.viewerByClerkId, {
      clerkId: identity.subject,
    })
    if (!viewer) {
      throw new ConvexError('Viewer not found')
    }

    const { accessToken, scopes } = await getGithubAccessToken(identity.subject)
    const repositories = await githubRequest<GithubRepository[]>(
      '/user/repos?visibility=public&sort=updated&per_page=100',
      accessToken,
    )

    await ctx.runMutation(internal.github.recordGithubTokenState, {
      userId: viewer._id,
      tokenStatus: 'active',
      scopes,
      lastError: null,
    })

    return repositories.map(mapGithubRepository)
  },
})

export const importSelectedRepositories = action({
  args: {
    fullNames: v.array(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    createdProjectIds: unknown[]
    reposNew: number
    reposUpdated: number
    skippedRepos: string[]
  }> => {
    const identity = await requireIdentity(ctx)
    const viewer = await ctx.runQuery(internal.users.viewerByClerkId, {
      clerkId: identity.subject,
    })

    if (!viewer) {
      throw new ConvexError('Viewer not found')
    }

    const { accessToken, scopes } = await getGithubAccessToken(identity.subject)

    const repositories = await Promise.all(
      args.fullNames.map((fullName) =>
        githubRequest<GithubRepository>(`/repos/${fullName}`, accessToken),
      ),
    )

    const result = await ctx.runMutation(
      internal.projects.upsertImportedRepositories,
      {
        ownerId: viewer._id,
        repositories: repositories.map(mapGithubRepository),
      },
    )

    await ctx.runMutation(internal.github.recordGithubTokenState, {
      userId: viewer._id,
      tokenStatus: 'active',
      scopes,
      lastError: null,
    })

    return result
  },
})

export const likeProject = action({
  args: {
    projectId: v.id('projects'),
  },
  handler: async (ctx, args): Promise<null> => {
    const identity = await requireIdentity(ctx)
    const project = await ctx.runQuery(internal.projects.projectById, {
      projectId: args.projectId,
    })
    const viewer = await ctx.runQuery(internal.users.viewerByClerkId, {
      clerkId: identity.subject,
    })

    if (!project || !viewer) {
      throw new ConvexError('Project not found')
    }

    const { accessToken, scopes } = await getGithubAccessToken(identity.subject)
    await githubNoContentRequest(
      `/user/starred/${project.github.fullName}`,
      accessToken,
      { method: 'PUT' },
    )
    await ctx.runMutation(internal.github.recordGithubTokenState, {
      userId: viewer._id,
      tokenStatus: 'active',
      scopes,
      lastError: null,
    })

    return await ctx.runMutation(internal.github.applyProjectLike, {
      projectId: args.projectId,
      clerkId: identity.subject,
    })
  },
})

export const unlikeProject = action({
  args: {
    projectId: v.id('projects'),
  },
  handler: async (ctx, args): Promise<null> => {
    const identity = await requireIdentity(ctx)
    const project = await ctx.runQuery(internal.projects.projectById, {
      projectId: args.projectId,
    })
    const viewer = await ctx.runQuery(internal.users.viewerByClerkId, {
      clerkId: identity.subject,
    })

    if (!project || !viewer) {
      throw new ConvexError('Project not found')
    }

    const { accessToken, scopes } = await getGithubAccessToken(identity.subject)
    await githubNoContentRequest(
      `/user/starred/${project.github.fullName}`,
      accessToken,
      { method: 'DELETE' },
    )
    await ctx.runMutation(internal.github.recordGithubTokenState, {
      userId: viewer._id,
      tokenStatus: 'active',
      scopes,
      lastError: null,
    })

    return await ctx.runMutation(internal.github.removeProjectLike, {
      projectId: args.projectId,
      clerkId: identity.subject,
    })
  },
})

export const refreshProjectMetadata = internalAction({
  args: {
    projectId: v.id('projects'),
  },
  handler: async (ctx, args) => {
    const project = await ctx.runQuery(internal.projects.projectById, {
      projectId: args.projectId,
    })

    if (!project) {
      return null
    }

    const owner = await ctx.runQuery(internal.users.userById, {
      userId: project.ownerId,
    })
    if (!owner) {
      return null
    }

    const { accessToken, scopes } = await getGithubAccessToken(owner.clerkId)
    const repository = await githubRequest<GithubRepository>(
      `/repos/${project.github.fullName}`,
      accessToken,
    )

    await ctx.runMutation(internal.github.patchProjectMetadata, {
      projectId: project._id,
      repository: mapGithubRepository(repository),
    })

    await ctx.runMutation(internal.github.recordGithubTokenState, {
      userId: owner._id,
      tokenStatus: 'active',
      scopes,
      lastError: null,
    })

    return null
  },
})

export const refreshActiveProjectMetadata = internalAction({
  args: {},
  handler: async (ctx): Promise<{ refreshed: number }> => {
    const projects = await ctx.runQuery(
      internal.github.listRefreshableProjects,
      {},
    )

    for (const project of projects) {
      await ctx.runAction(internal.github_actions.refreshProjectMetadata, {
        projectId: project._id,
      })
    }

    return { refreshed: projects.length }
  },
})

export const syncProjectContributors = internalAction({
  args: {
    projectId: v.id('projects'),
  },
  handler: async () => {
    return null
  },
})

export const cleanupDeletedAccountStars = internalAction({
  args: {
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const user = await ctx.runQuery(internal.users.userById, {
      userId: args.userId,
    })

    if (!user) {
      return null
    }

    let accessToken = ''
    try {
      const tokenState = await getGithubAccessToken(user.clerkId)
      accessToken = tokenState.accessToken
    } catch {
      return null
    }

    const likes = await ctx.runQuery(internal.github.likedProjectsByUser, {
      userId: args.userId,
    })

    for (const like of likes) {
      if (!like.projectFullName) {
        continue
      }

      await githubNoContentRequest(
        `/user/starred/${like.projectFullName}`,
        accessToken,
        { method: 'DELETE' },
      )
    }

    return null
  },
})
