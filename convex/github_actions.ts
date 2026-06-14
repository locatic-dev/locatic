'use node'

import { createClerkClient } from '@clerk/backend'
import { ConvexError, v } from 'convex/values'

import { internal } from './_generated/api'
import type { Doc, Id } from './_generated/dataModel'
import { action, internalAction } from './_generated/server'
import { buildViewerSeedFromIdentity, requireIdentity } from './lib/auth'
import {
  encodeRepositoryFullNamePath,
  extractContributionCalendar,
  listGithubRepositoryPages,
  mapGithubRepository,
  mapGithubRepositoryWithOptionalLanguages,
  normalizeRepositoryFullNames,
  normalizeGithubReadmeImport,
  assertGithubRawDownloadUrl,
  type GithubLanguages,
  type GithubReadmeImport,
  type GithubReadmeMetadata,
  type GithubRepository,
} from './lib/github'
import { enforceRateLimit } from './lib/rate_limits'

class GitHubRequestError extends Error {
  constructor(public status: number) {
    super(`GitHub request failed: ${status}`)
  }
}

type ProjectReadmeBackfillBatch = {
  hasMore: boolean
  limit: number
  refreshAll: boolean
  remaining: number
  scanned: number
  targets: Array<{
    currentReadmeLength: number
    fullName: string
    projectId: Id<'projects'>
  }>
  totalCandidates: number
}

type ProjectReadmeBackfillBatchPage = {
  continueCursor: string
  hasMore: boolean
  remainingLowerBound: number
  scanned: number
  targets: ProjectReadmeBackfillBatch['targets']
  totalCandidatesLowerBound: number
}

type ProjectReadmeBackfillResult = {
  error: string | null
  fullName: string
  readmeLength: number
  status: 'failed' | 'missing' | 'updated'
}

type ProjectReadmeBackfillSummary = {
  failed: number
  hasMore: boolean
  limit: number
  missing: number
  refreshAll: boolean
  remaining: number
  results: ProjectReadmeBackfillResult[]
  scanned: number
  totalCandidates: number
  updated: number
}

type GithubContributor = {
  id: number | null
  login: string
  contributions: number
  type: string
}

export type GithubRelease = {
  id: number
  tag_name: string
  name: string | null
  body: string | null
  html_url: string
  draft: boolean
  prerelease: boolean
  published_at: string | null
  created_at: string
  updated_at: string
}

type GithubReleasePageImport = {
  exhausted: boolean
  releases: GithubRelease[]
}

const GITHUB_RELEASES_PER_PAGE = 100
const MAX_GITHUB_RELEASE_IMPORT_PAGES = 3

const projectReadmeBackfillResultValidator = v.object({
  error: v.union(v.string(), v.null()),
  fullName: v.string(),
  readmeLength: v.number(),
  status: v.union(
    v.literal('failed'),
    v.literal('missing'),
    v.literal('updated'),
  ),
})

const projectReadmeBackfillSummaryValidator = v.object({
  failed: v.number(),
  hasMore: v.boolean(),
  limit: v.number(),
  missing: v.number(),
  refreshAll: v.boolean(),
  remaining: v.number(),
  results: v.array(projectReadmeBackfillResultValidator),
  scanned: v.number(),
  totalCandidates: v.number(),
  updated: v.number(),
})

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

async function githubRawTextRequest(
  url: string,
  accessToken?: string,
  init?: RequestInit,
) {
  const downloadUrl = assertGithubRawDownloadUrl(url)
  const headers = new Headers(init?.headers)
  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`)
  }

  const response = await fetch(downloadUrl, {
    ...init,
    headers,
  })

  if (!response.ok) {
    throw new GitHubRequestError(response.status)
  }

  return response.text()
}

async function githubOptionalRequest<T>(url: string, init?: RequestInit) {
  const headers = new Headers(init?.headers)
  headers.set('Accept', 'application/vnd.github+json')
  headers.set('X-GitHub-Api-Version', '2022-11-28')

  const response = await fetch(`https://api.github.com${url}`, {
    ...init,
    headers,
  })

  if (response.status === 404) {
    return null
  }

  if (!response.ok) {
    throw new GitHubRequestError(response.status)
  }

  return (await response.json()) as T
}

async function fetchGithubReleasePages(
  repositoryPath: string,
  accessToken: string,
): Promise<GithubReleasePageImport> {
  const releases: GithubRelease[] = []
  let exhausted = false

  for (let page = 1; page <= MAX_GITHUB_RELEASE_IMPORT_PAGES; page += 1) {
    const pageReleases = await githubRequest<GithubRelease[]>(
      `/repos/${repositoryPath}/releases?per_page=${GITHUB_RELEASES_PER_PAGE}&page=${page}`,
      accessToken,
    )
    releases.push(...pageReleases)

    if (pageReleases.length < GITHUB_RELEASES_PER_PAGE) {
      exhausted = true
      break
    }
  }

  return { exhausted, releases }
}

function githubActionErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  return 'Unknown GitHub sync error'
}

export function shouldDeleteMissingProjectReleasesAfterImport(
  releaseImport: Pick<GithubReleasePageImport, 'exhausted'>,
) {
  return releaseImport.exhausted
}

export function mapGithubReleaseForImport(release: GithubRelease) {
  return {
    githubReleaseId: release.id,
    tagName: release.tag_name,
    name: release.name,
    body: release.body,
    htmlUrl: release.html_url,
    isDraft: release.draft,
    isPrerelease: release.prerelease,
    publishedAt: release.published_at ? Date.parse(release.published_at) : null,
    createdAt: Date.parse(release.created_at),
    updatedAt: Date.parse(release.updated_at),
  }
}

async function fetchGithubReadmeImport(
  repositoryPath: string,
  accessToken: string,
): Promise<GithubReadmeImport | null> {
  const metadata = await githubRequest<GithubReadmeMetadata>(
    `/repos/${repositoryPath}/readme`,
    accessToken,
  )
  const markdown = metadata.download_url
    ? await githubRawTextRequest(metadata.download_url, accessToken)
    : null

  return { markdown, metadata }
}

async function fetchOptionalGithubReadmeImport(
  repositoryPath: string,
): Promise<GithubReadmeImport | null> {
  const metadata = await githubOptionalRequest<GithubReadmeMetadata>(
    `/repos/${repositoryPath}/readme`,
  )
  const markdown = metadata?.download_url
    ? await githubRawTextRequest(metadata.download_url)
    : null

  return metadata ? { markdown, metadata } : null
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
    await enforceRateLimit(ctx, 'githubRepoList', String(viewer._id))

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
    await enforceRateLimit(ctx, 'githubRepoImport', String(viewer._id))

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
          fetchReadme: () =>
            fetchGithubReadmeImport(repositoryPath, accessToken),
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
  handler: async (ctx, args): Promise<null> => {
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
    await enforceRateLimit(ctx, 'reactionWrite', String(viewer._id))

    if (!project) {
      throw new ConvexError('Project not found')
    }

    await ctx.runMutation(internal.github.applyProjectLike, {
      projectId: args.projectId,
      clerkId: identity.subject,
    })

    return null
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
    const viewer = await ctx.runMutation(
      internal.users.ensureViewerFromIdentity,
      {
        ...buildViewerSeedFromIdentity(identity),
      },
    )
    if (!viewer) {
      throw new ConvexError('Viewer not found')
    }
    await enforceRateLimit(ctx, 'reactionWrite', String(viewer._id))

    if (!project) {
      throw new ConvexError('Project not found')
    }

    await ctx.runMutation(internal.github.removeProjectLike, {
      projectId: args.projectId,
      clerkId: identity.subject,
    })

    return null
  },
})

export const refreshProjectMetadata = internalAction({
  args: {
    projectId: v.id('projects'),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ matchedCount: number; totalFetched: number } | null> => {
    const project = (await ctx.runQuery(internal.projects.projectById, {
      projectId: args.projectId,
    })) as Doc<'projects'> | null

    if (!project) {
      return null
    }

    const owner = await ctx.runQuery(internal.users.userById, {
      userId: project.ownerId,
    })
    if (!owner) {
      return null
    }

    const repositoryPath = encodeRepositoryFullNamePath(project.github.fullName)

    try {
      const { accessToken, scopes } = await getGithubAccessToken(owner.clerkId)
      const [repository, releaseImport] = await Promise.all([
        mapGithubRepositoryWithOptionalLanguages({
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
          fetchReadme: () =>
            fetchGithubReadmeImport(repositoryPath, accessToken),
        }),
        fetchGithubReleasePages(repositoryPath, accessToken),
      ])

      await ctx.runMutation(internal.github.patchProjectMetadata, {
        projectId: project._id,
        repository,
      })
      await ctx.runMutation(internal.github.patchProjectReleases, {
        deleteMissing:
          shouldDeleteMissingProjectReleasesAfterImport(releaseImport),
        projectId: project._id,
        releases: releaseImport.releases.map(mapGithubReleaseForImport),
      })

      await ctx.runMutation(internal.github.recordGithubTokenState, {
        userId: owner._id,
        tokenStatus: 'active',
        scopes,
        lastError: null,
      })
      await ctx.runMutation(internal.github.recordGithubSyncResult, {
        userId: owner._id,
        syncType: 'metadata',
        reposFetched: 1,
        reposNew: 0,
        reposUpdated: 1,
        status: 'success',
        error: null,
        githubRateLimitRemaining: null,
      })
    } catch (error) {
      const message = githubActionErrorMessage(error)
      await ctx.runMutation(internal.github.recordProjectMetadataSyncFailure, {
        error: message,
        projectId: project._id,
      })
      throw error
    }

    return null
  },
})

export const refreshActiveProjectMetadata = internalAction({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ failed: number; refreshed: number }> => {
    const projectIds = await ctx.runQuery(
      internal.github.listRefreshableProjectIds,
      {
        limit: args.limit,
      },
    )
    let failed = 0

    for (const projectId of projectIds) {
      try {
        await ctx.runAction(internal.github_actions.refreshProjectMetadata, {
          projectId,
        })
      } catch (error) {
        failed += 1
        console.error(
          `Scheduled GitHub metadata refresh failed for ${projectId}: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        )
      }
    }

    return { failed, refreshed: projectIds.length - failed }
  },
})

export const backfillProjectReadmes = internalAction({
  args: {
    limit: v.optional(v.number()),
    refreshAll: v.optional(v.boolean()),
  },
  returns: projectReadmeBackfillSummaryValidator,
  handler: async (ctx, args): Promise<ProjectReadmeBackfillSummary> => {
    const limit = Math.min(Math.max(Math.floor(args.limit ?? 100), 1), 100)
    const refreshAll = args.refreshAll ?? false
    const targets: ProjectReadmeBackfillBatch['targets'] = []
    let cursor: string | null = null
    let hasMore = false
    let remaining = 0
    let scanned = 0
    let totalCandidates = 0

    while (targets.length < limit) {
      const page: ProjectReadmeBackfillBatchPage = await ctx.runQuery(
        internal.github.listProjectReadmeBackfillTargets,
        {
          cursor,
          limit: limit - targets.length,
          refreshAll,
        },
      )

      targets.push(...page.targets)
      cursor = page.continueCursor
      hasMore = page.hasMore
      remaining += page.remainingLowerBound
      scanned += page.scanned
      totalCandidates += page.totalCandidatesLowerBound

      if (!page.hasMore || page.scanned === 0) {
        break
      }
    }

    const batch: ProjectReadmeBackfillBatch = {
      hasMore,
      limit,
      refreshAll,
      remaining,
      scanned,
      targets,
      totalCandidates,
    }
    const results: ProjectReadmeBackfillResult[] = []

    for (const target of batch.targets) {
      try {
        const repositoryPath = encodeRepositoryFullNamePath(target.fullName)
        const readme = await fetchOptionalGithubReadmeImport(repositoryPath)
        const readmeImport = normalizeGithubReadmeImport(readme)

        await ctx.runMutation(internal.github.patchProjectReadmePreview, {
          projectId: target.projectId,
          ...readmeImport,
        })

        const status = readmeImport.readmePreview ? 'updated' : 'missing'
        const readmeLength = readmeImport.readmePreview?.length ?? 0
        console.info(
          `README backfill ${status}: ${target.fullName} (${readmeLength} chars)`,
        )
        results.push({
          error: null,
          fullName: target.fullName,
          readmeLength,
          status,
        })
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Unknown README backfill error'
        console.error(`README backfill failed: ${target.fullName}: ${message}`)
        results.push({
          error: message,
          fullName: target.fullName,
          readmeLength: 0,
          status: 'failed',
        })
      }
    }

    return {
      failed: results.filter((result) => result.status === 'failed').length,
      hasMore: batch.hasMore,
      limit: batch.limit,
      missing: results.filter((result) => result.status === 'missing').length,
      refreshAll: batch.refreshAll,
      remaining: batch.remaining,
      results,
      scanned: batch.scanned,
      totalCandidates: batch.totalCandidates,
      updated: results.filter((result) => result.status === 'updated').length,
    }
  },
})

export const syncProjectContributors = internalAction({
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

    await enforceRateLimit(ctx, 'githubContributionSync', String(owner._id))
    const { accessToken } = await getGithubAccessToken(owner.clerkId)
    const repositoryPath = encodeRepositoryFullNamePath(project.github.fullName)
    const contributors = await listGithubRepositoryPages({
      maxPages: 5,
      perPage: 100,
      fetchPage: (page, perPage) =>
        githubRequest<GithubContributor[]>(
          `/repos/${repositoryPath}/contributors?per_page=${perPage}&page=${page}`,
          accessToken,
        ),
    })
    const result = (await ctx.runMutation(
      internal.github.patchProjectContributors,
      {
        projectId: project._id,
        contributors: contributors.flatMap((contributor) =>
          contributor.id === null || contributor.type !== 'User'
            ? []
            : [
                {
                  githubId: contributor.id,
                  githubUsername: contributor.login,
                  commitCount: contributor.contributions,
                },
              ],
        ),
      },
    )) as { matchedCount: number; totalFetched: number } | null

    await ctx.runMutation(internal.github.recordGithubSyncResult, {
      userId: owner._id,
      syncType: 'contributors',
      reposFetched: 1,
      reposNew: 0,
      reposUpdated: result ? 1 : 0,
      status: 'success',
      error: null,
      githubRateLimitRemaining: null,
    })

    return result
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
    await enforceRateLimit(ctx, 'githubContributionSync', String(viewer._id))

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
