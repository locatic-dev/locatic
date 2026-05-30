'use node'

import { createClerkClient } from '@clerk/backend'
import { ConvexError, v } from 'convex/values'

import { internal } from './_generated/api'
import { action, internalAction } from './_generated/server'
import { buildViewerSeedFromIdentity, requireIdentity } from './lib/auth'
import {
  encodeRepositoryFullNamePath,
  extractContributionCalendar,
  listGithubRepositoryPages,
  mapGithubRepository,
  mapGithubRepositoryWithOptionalLanguages,
  normalizeRepositoryFullNames,
  type GithubLanguages,
  type GithubRepository,
} from './lib/github'

class GitHubRequestError extends Error {
  constructor(public status: number) {
    super(`GitHub request failed: ${status}`)
  }
}

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
    throw new GitHubRequestError(response.status)
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

async function githubGraphqlRequest<T>(
  gqlQuery: string,
  variables: Record<string, unknown>,
  accessToken: string,
): Promise<T> {
  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({ query: gqlQuery, variables }),
  })

  if (!response.ok) {
    throw new ConvexError(`GitHub GraphQL request failed: ${response.status}`)
  }

  const json = (await response.json()) as { data?: T; errors?: unknown[] }
  if (json.errors?.length) {
    throw new ConvexError(
      `GitHub GraphQL errors: ${JSON.stringify(json.errors)}`,
    )
  }

  return json.data as T
}

const CONTRIBUTION_QUERY = `
  query ContributionGraph($login: String!) {
    user(login: $login) {
      contributionsCollection {
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              date
              contributionCount
            }
          }
        }
      }
    }
  }
`

export const listRepositories = action({
  args: {},
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx)
    const viewer = await ctx.runMutation(
      internal.users.ensureViewerFromIdentity,
      {
        ...buildViewerSeedFromIdentity(identity),
      },
    )
    if (!viewer) {
      throw new ConvexError('Viewer not found')
    }

    const { accessToken, scopes } = await getGithubAccessToken(identity.subject)
    let repositories: GithubRepository[] = []
    try {
      repositories = await listGithubRepositoryPages({
        fetchPage: (page, perPage) =>
          githubRequest<GithubRepository[]>(
            `/user/repos?visibility=public&sort=updated&per_page=${perPage}&page=${page}`,
            accessToken,
          ),
      })
    } catch (error) {
      if (error instanceof GitHubRequestError) {
        await ctx.runMutation(internal.github.recordGithubTokenState, {
          userId: viewer._id,
          tokenStatus: error.status === 401 ? 'needs_reauth' : 'active',
          scopes,
          lastError: `GitHub request failed: ${error.status}`,
        })
      }

      throw new ConvexError('Could not load GitHub repositories')
    }

    await ctx.runMutation(internal.github.recordGithubTokenState, {
      userId: viewer._id,
      tokenStatus: 'active',
      scopes,
      lastError: null,
    })

    return repositories.map((repository) => mapGithubRepository(repository))
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
    const viewer = await ctx.runMutation(
      internal.users.ensureViewerFromIdentity,
      {
        ...buildViewerSeedFromIdentity(identity),
      },
    )
    if (!viewer) {
      throw new ConvexError('Viewer not found')
    }

    let fullNames: string[]
    try {
      fullNames = normalizeRepositoryFullNames(args.fullNames)
    } catch (error) {
      throw new ConvexError(
        error instanceof Error
          ? error.message
          : 'Repository selection is invalid',
      )
    }

    const { accessToken, scopes } = await getGithubAccessToken(identity.subject)

    const repositoryResults = await Promise.allSettled(
      fullNames.map((fullName) => {
        const repositoryPath = encodeRepositoryFullNamePath(fullName)

        return mapGithubRepositoryWithOptionalLanguages({
          fetchRepository: () =>
            githubRequest<GithubRepository>(
              `/repos/${repositoryPath}`,
              accessToken,
            ),
          fetchLanguages: () =>
            githubRequest<GithubLanguages>(
              `/repos/${repositoryPath}/languages`,
              accessToken,
            ),
        })
      }),
    )

    const repositories = repositoryResults.flatMap((result) =>
      result.status === 'fulfilled' ? [result.value] : [],
    )
    const skippedRepos = repositoryResults.flatMap((result, index) =>
      result.status === 'rejected' ? [fullNames[index] ?? 'unknown'] : [],
    )
    const requestFailure = repositoryResults.find(
      (result): result is PromiseRejectedResult =>
        result.status === 'rejected' &&
        result.reason instanceof GitHubRequestError,
    )

    if (requestFailure) {
      await ctx.runMutation(internal.github.recordGithubTokenState, {
        userId: viewer._id,
        tokenStatus:
          requestFailure.reason.status === 401 ? 'needs_reauth' : 'active',
        scopes,
        lastError: `GitHub request failed: ${requestFailure.reason.status}`,
      })

      if (requestFailure.reason.status === 401) {
        throw new ConvexError('Refresh your GitHub connection and try again')
      }
    }

    const result = await ctx.runMutation(
      internal.projects.upsertImportedRepositories,
      {
        ownerId: viewer._id,
        repositories,
      },
    )

    if (!requestFailure) {
      await ctx.runMutation(internal.github.recordGithubTokenState, {
        userId: viewer._id,
        tokenStatus: 'active',
        scopes,
        lastError: null,
      })
    }

    return result
      ? {
          ...result,
          skippedRepos: [...new Set([...result.skippedRepos, ...skippedRepos])],
        }
      : {
          createdProjectIds: [],
          reposNew: 0,
          reposUpdated: 0,
          skippedRepos,
        }
  },
})

export const likeProject = action({
  args: {
    projectId: v.id('projects'),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    githubSyncAttempted: boolean
    githubSyncSucceeded: boolean
    githubSyncError: string | null
  }> => {
    const identity = await requireIdentity(ctx)
    const project = await ctx.runQuery(internal.projects.projectById, {
      projectId: args.projectId,
    })
    const viewer = await ctx.runMutation(
      internal.users.ensureViewerFromIdentity,
      {
        ...buildViewerSeedFromIdentity(identity),
      },
    )
    if (!viewer) {
      throw new ConvexError('Viewer not found')
    }

    if (!project) {
      throw new ConvexError('Project not found')
    }

    await ctx.runMutation(internal.github.applyProjectLike, {
      projectId: args.projectId,
      clerkId: identity.subject,
    })

    return {
      githubSyncAttempted: false,
      githubSyncSucceeded: false,
      githubSyncError: null,
    }
  },
})

export const unlikeProject = action({
  args: {
    projectId: v.id('projects'),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    githubSyncAttempted: boolean
    githubSyncSucceeded: boolean
    githubSyncError: string | null
  }> => {
    const identity = await requireIdentity(ctx)
    const project = await ctx.runQuery(internal.projects.projectById, {
      projectId: args.projectId,
    })
    const viewer = await ctx.runMutation(
      internal.users.ensureViewerFromIdentity,
      {
        ...buildViewerSeedFromIdentity(identity),
      },
    )
    if (!viewer) {
      throw new ConvexError('Viewer not found')
    }

    if (!project) {
      throw new ConvexError('Project not found')
    }

    await ctx.runMutation(internal.github.removeProjectLike, {
      projectId: args.projectId,
      clerkId: identity.subject,
    })

    return {
      githubSyncAttempted: false,
      githubSyncSucceeded: false,
      githubSyncError: null,
    }
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
    const repository = await mapGithubRepositoryWithOptionalLanguages({
      fetchRepository: () =>
        githubRequest<GithubRepository>(
          `/repos/${project.github.fullName}`,
          accessToken,
        ),
      fetchLanguages: () =>
        githubRequest<GithubLanguages>(
          `/repos/${project.github.fullName}/languages`,
          accessToken,
        ),
    })

    await ctx.runMutation(internal.github.patchProjectMetadata, {
      projectId: project._id,
      repository,
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

export const syncContributions = action({
  args: {},
  handler: async (ctx): Promise<void> => {
    const identity = await requireIdentity(ctx)
    const viewer = await ctx.runMutation(
      internal.users.ensureViewerFromIdentity,
      { ...buildViewerSeedFromIdentity(identity) },
    )
    if (!viewer) throw new ConvexError('Viewer not found')

    const { accessToken } = await getGithubAccessToken(identity.subject)

    type GraphQLResult = {
      user: {
        contributionsCollection: {
          contributionCalendar: {
            totalContributions: number
            weeks: Array<{
              contributionDays: Array<{
                date: string
                contributionCount: number
              }>
            }>
          }
        }
      }
    }

    const result = await githubGraphqlRequest<GraphQLResult>(
      CONTRIBUTION_QUERY,
      { login: viewer.github.username },
      accessToken,
    )

    const calendar = extractContributionCalendar(result)
    if (!calendar) {
      return
    }

    await ctx.runMutation(internal.users.patchContributions, {
      userId: viewer._id,
      contributions: {
        totalContributions: calendar.totalContributions,
        weeks: calendar.weeks,
        syncedAt: Date.now(),
      },
    })
  },
})
