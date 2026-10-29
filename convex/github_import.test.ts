import rateLimiterTest from '@convex-dev/rate-limiter/test'
import { convexTest, type TestConvex } from 'convex-test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api, internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import {
  fixtureClerkId,
  NOW,
  seedProject,
  seedUser,
} from './__tests__/fixtures.helpers'
import { mapGithubRepository } from './lib/github'
import schema from './schema'

const { getUserOauthAccessToken } = vi.hoisted(() => ({
  getUserOauthAccessToken: vi.fn(),
}))

vi.mock('@clerk/backend', () => ({
  createClerkClient: () => ({ users: { getUserOauthAccessToken } }),
}))

const modules = import.meta.glob('./**/*.ts')
type T = TestConvex<typeof schema>
type GithubFetch = (input: string, init: RequestInit) => Promise<Response>

function repository(fullName = 'ada/engine', id = 101) {
  const [owner, name] = fullName.split('/')
  return {
    id,
    full_name: fullName,
    name: name!,
    owner: { id: owner === 'ada' ? 100 : 200, login: owner! },
    private: false,
    visibility: 'public',
    permissions: {
      admin: false,
      maintain: false,
      push: false,
      pull: true,
      triage: false,
    },
    description: 'A public project',
    html_url: `https://github.com/${fullName}`,
    homepage: null,
    language: 'TypeScript',
    topics: [],
    stargazers_count: 3,
    pushed_at: new Date(NOW).toISOString(),
  }
}

describe('GitHub repository import authorization', () => {
  let t: T
  let viewerId: Id<'users'>
  let repositories: Map<string, ReturnType<typeof repository>>
  let authenticatedGithubUser: {
    id: number | null
    login: string
    type: string
  }
  let fetchMock: ReturnType<typeof vi.fn<GithubFetch>>

  beforeEach(async () => {
    vi.useFakeTimers({ now: NOW })
    vi.stubEnv('CLERK_SECRET_KEY', 'test_clerk_key')
    getUserOauthAccessToken.mockReset()
    getUserOauthAccessToken.mockResolvedValue({
      data: [{ token: 'test_github_token', scopes: ['public_repo'] }],
    })
    authenticatedGithubUser = { id: 100, login: 'ada', type: 'User' }
    repositories = new Map()
    t = convexTest(schema, modules)
    rateLimiterTest.register(t)
    viewerId = await seedUser(t, { username: 'ada' })
    fetchMock = vi.fn(async (input: string, init: RequestInit) => {
      expect(new Headers(init.headers).get('Authorization')).toBe(
        'Bearer test_github_token',
      )
      const url = new URL(input)
      if (url.pathname === '/user')
        return Response.json(authenticatedGithubUser)
      if (url.pathname === '/user/repos')
        return Response.json([...repositories.values()])
      const fullName = decodeURIComponent(url.pathname.slice('/repos/'.length))
      const selected = repositories.get(fullName)
      if (selected) return Response.json(selected)
      if (url.pathname.endsWith('/languages'))
        return Response.json({ TypeScript: 100 })
      if (
        url.pathname.endsWith('/releases') ||
        url.pathname.endsWith('/contributors')
      )
        return Response.json([])
      if (url.pathname.endsWith('/readme'))
        return new Response(null, { status: 404 })
      throw new Error(`Unexpected GitHub request: ${url.pathname}`)
    })
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  function viewer() {
    return t.withIdentity({ subject: fixtureClerkId('ada') })
  }

  async function importRepository(value: ReturnType<typeof repository>) {
    repositories.set(value.full_name, value)
    return await viewer().action(
      api.github_actions.importSelectedRepositories,
      {
        fullNames: [value.full_name],
      },
    )
  }

  async function storedProjects() {
    return await t.run((ctx) => ctx.db.query('projects').collect())
  }

  it('rejects signed-out imports before requesting an OAuth token', async () => {
    await expect(
      t.action(api.github_actions.importSelectedRepositories, {
        fullNames: ['ada/engine'],
      }),
    ).rejects.toThrow('Unauthorized')
    expect(getUserOauthAccessToken).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('marks a revoked token for reconnection when identity verification returns 401', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }))

    await expect(
      viewer().action(api.github_actions.importSelectedRepositories, {
        fullNames: ['ada/engine'],
      }),
    ).rejects.toThrow('Refresh your GitHub connection and try again')

    const state = await t.run((ctx) => ctx.db.query('github_tokens').first())
    expect(state).toMatchObject({
      userId: viewerId,
      tokenStatus: 'needs_reauth',
    })
    expect(await storedProjects()).toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('rejects first-claiming an unrelated public repository before reading its content', async () => {
    const result = await importRepository(repository('stranger/project'))
    expect(result).toMatchObject({
      reposNew: 0,
      reposUpdated: 0,
      skippedRepos: ['stranger/project'],
    })
    expect(await storedProjects()).toEqual([])
    expect(fetchMock.mock.calls.map(([url]) => url)).not.toContain(
      'https://api.github.com/repos/stranger/project/languages',
    )
    expect(fetchMock.mock.calls.map(([url]) => url)).not.toContain(
      'https://api.github.com/repos/stranger/project/readme',
    )
  })

  for (const visibility of ['private', 'internal']) {
    it(`rejects ${visibility} repositories even when the authenticated user owns them`, async () => {
      const value = repository()
      value.private = visibility === 'private'
      value.visibility = visibility
      const result = await importRepository(value)
      expect(result.reposNew).toBe(0)
      expect(result.skippedRepos).toEqual(['ada/engine'])
      expect(await storedProjects()).toEqual([])
    })
  }

  it('fails closed if GitHub does not explicitly confirm public visibility', async () => {
    const value = repository()
    Reflect.deleteProperty(value, 'private')
    const result = await importRepository(value)
    expect(result.reposNew).toBe(0)
    expect(await storedProjects()).toEqual([])
  })

  it('uses the OAuth account stable ID rather than a stored or supplied GitHub username', async () => {
    authenticatedGithubUser.login = 'new-ada-login'
    const value = repository('new-ada-login/engine')
    value.owner.id = 100
    const result = await importRepository(value)
    expect(result.reposNew).toBe(1)
    expect((await storedProjects())[0]).toMatchObject({
      ownerId: viewerId,
      github: { fullName: 'new-ada-login/engine', repoId: 101 },
    })
    expect(getUserOauthAccessToken).toHaveBeenCalledWith(
      fixtureClerkId('ada'),
      'github',
    )
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/user',
      expect.anything(),
    )
  })

  it('does not trust matching owner login when the stable GitHub ID differs', async () => {
    const value = repository()
    value.owner.id = 999
    const result = await importRepository(value)
    expect(result.reposNew).toBe(0)
    expect(await storedProjects()).toEqual([])
  })

  for (const permission of ['admin', 'maintain', 'push'] as const) {
    it(`allows a public organization or collaborator repository with ${permission} permission`, async () => {
      const value = repository('organization/engine')
      value.permissions[permission] = true
      const result = await importRepository(value)
      expect(result.reposNew).toBe(1)
      expect((await storedProjects())[0]?.ownerId).toBe(viewerId)
    })
  }

  it('does not let write permission bypass public-visibility checks', async () => {
    const value = repository('organization/private')
    value.private = true
    value.visibility = 'private'
    value.permissions.admin = true
    const result = await importRepository(value)
    expect(result.reposNew).toBe(0)
    expect(await storedProjects()).toEqual([])
  })

  it('rejects triage-only access to an unrelated public repository', async () => {
    const value = repository('organization/engine')
    value.permissions.triage = true
    repositories.set(value.full_name, value)
    const result = await viewer().action(
      api.github_actions.importSelectedRepositories,
      {
        fullNames: [value.full_name],
      },
    )
    expect(result.reposNew).toBe(0)
    expect(await storedProjects()).toEqual([])
  })

  it('continues a mixed batch after a GitHub repository request fails', async () => {
    const own = repository()
    repositories.set(own.full_name, own)
    const normalFetch = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation((input: string, init: RequestInit) =>
      input === 'https://api.github.com/repos/ada/unavailable'
        ? Promise.resolve(new Response(null, { status: 502 }))
        : normalFetch(input, init),
    )
    const result = await viewer().action(
      api.github_actions.importSelectedRepositories,
      {
        fullNames: [own.full_name, 'ada/unavailable'],
      },
    )
    expect(result).toMatchObject({
      reposNew: 1,
      skippedRepos: ['ada/unavailable'],
    })
    expect((await storedProjects()).map((p) => p.github.fullName)).toEqual([
      own.full_name,
    ])
  })

  it('fails closed if the authenticated GitHub identity is invalid', async () => {
    authenticatedGithubUser.id = null
    repositories.set('ada/engine', repository())
    await expect(
      viewer().action(api.github_actions.importSelectedRepositories, {
        fullNames: ['ada/engine'],
      }),
    ).rejects.toThrow('Could not verify GitHub account')
    expect(await storedProjects()).toEqual([])
    expect(fetchMock).not.toHaveBeenCalledWith(
      'https://api.github.com/repos/ada/engine',
      expect.anything(),
    )
  })

  it('imports permitted entries and reports rejected entries independently in a mixed batch', async () => {
    const own = repository()
    const unrelated = repository('stranger/project', 102)
    const privateRepo = repository('ada/private', 103)
    privateRepo.private = true
    privateRepo.visibility = 'private'
    for (const value of [own, unrelated, privateRepo])
      repositories.set(value.full_name, value)
    const result = await viewer().action(
      api.github_actions.importSelectedRepositories,
      {
        fullNames: [own.full_name, unrelated.full_name, privateRepo.full_name],
      },
    )
    expect(result).toMatchObject({
      reposNew: 1,
      reposUpdated: 0,
      skippedRepos: [unrelated.full_name, privateRepo.full_name],
    })
    expect((await storedProjects()).map((p) => p.github.fullName)).toEqual([
      'ada/engine',
    ])
  })

  it('filters the picker with the same trusted public/write-relationship policy', async () => {
    const own = repository()
    const collaborator = repository('organization/project', 102)
    collaborator.permissions.push = true
    const unrelated = repository('stranger/project', 103)
    const privateRepo = repository('ada/private', 104)
    privateRepo.private = true
    privateRepo.visibility = 'private'
    for (const value of [own, collaborator, unrelated, privateRepo])
      repositories.set(value.full_name, value)
    const result = await viewer().action(
      api.github_actions.listRepositories,
      {},
    )
    expect(result.map((r) => r.fullName)).toEqual([
      own.full_name,
      collaborator.full_name,
    ])
  })

  it('uses the canonical repository identity returned by GitHub for a case-insensitive alias', async () => {
    const value = repository('Ada/Engine')
    value.owner.id = 100
    repositories.set('ada/engine', value)
    const result = await viewer().action(
      api.github_actions.importSelectedRepositories,
      { fullNames: ['ada/engine'] },
    )
    expect(result.reposNew).toBe(1)
    expect((await storedProjects())[0]?.github.fullName).toBe('Ada/Engine')
  })

  it('preserves an existing Locatic owner at the import transaction boundary', async () => {
    const otherOwnerId = await seedUser(t, { username: 'other' })
    const projectId = await seedProject(t, {
      ownerId: otherOwnerId,
      name: 'engine',
    })
    await t.run(async (ctx) => {
      const project = await ctx.db.get(projectId)
      await ctx.db.patch(projectId, {
        github: { ...project!.github, repoId: 101 },
      })
    })
    const result = await t.mutation(
      internal.projects.upsertImportedRepositories,
      {
        ownerId: viewerId,
        repositories: [mapGithubRepository(repository())],
      },
    )
    expect(result).toMatchObject({
      reposNew: 0,
      reposUpdated: 0,
      skippedRepos: ['ada/engine'],
    })
    expect((await storedProjects())[0]?.ownerId).toBe(otherOwnerId)
  })

  it('lets a deactivated owner import into their hidden showcase', async () => {
    await t.run((ctx) => ctx.db.patch(viewerId, { deactivatedAt: NOW }))
    const result = await importRepository(repository())
    expect(result.reposNew).toBe(1)
    expect((await storedProjects())[0]?.exploreOwner?.isEligible).toBe(false)
    expect(
      await t.query(api.projects.getPublicByRoute, {
        owner: 'ada',
        repo: 'engine',
      }),
    ).toBeNull()
    expect(
      await t.run((ctx) => ctx.db.query('github_tokens').first()),
    ).toMatchObject({ tokenStatus: 'active' })
  })

  for (const field of ['deletedAt', 'purgedAt'] as const) {
    it(`does not complete a delayed import for a ${field} owner`, async () => {
      await t.run((ctx) => ctx.db.patch(viewerId, { [field]: NOW }))
      await expect(
        t.mutation(internal.projects.upsertImportedRepositories, {
          ownerId: viewerId,
          repositories: [mapGithubRepository(repository())],
        }),
      ).rejects.toThrow('Owner not found')
      expect(await storedProjects()).toEqual([])
    })
  }

  async function existingProject() {
    const projectId = await seedProject(t, {
      ownerId: viewerId,
      name: 'engine',
    })
    await t.run(async (ctx) => {
      const project = await ctx.db.get(projectId)
      await ctx.db.patch(projectId, {
        github: {
          ...project!.github,
          repoId: 101,
          description: 'Previously public description',
          readmePreview: 'Previously public README',
        },
      })
    })
    await t.mutation(internal.github.recordGithubTokenState, {
      userId: viewerId,
      tokenStatus: 'active',
      scopes: ['public_repo'],
      lastError: null,
    })
    return projectId
  }

  for (const sync of [
    'refreshProjectMetadata',
    'syncProjectContributors',
  ] as const) {
    for (const visibility of ['private', 'internal']) {
      it(`rejects ${sync} when a previously public repository becomes ${visibility}`, async () => {
        const projectId = await existingProject()
        const value = repository()
        value.private = visibility === 'private'
        value.visibility = visibility
        value.permissions.admin = true
        value.description = 'Private description must never be ingested'
        repositories.set(value.full_name, value)

        await expect(
          t.action(internal.github_actions[sync], { projectId }),
        ).rejects.toThrow('Repository is no longer public')

        const project = await t.run((ctx) => ctx.db.get(projectId))
        expect(project?.github.description).toBe(
          'Previously public description',
        )
        expect(project?.github.readmePreview).toBe('Previously public README')
        const paths = fetchMock.mock.calls.map(([url]) => new URL(url).pathname)
        expect(paths).not.toContain('/repos/ada/engine/languages')
        expect(paths).not.toContain('/repos/ada/engine/readme')
        expect(paths).not.toContain('/repos/ada/engine/releases')
        expect(paths).not.toContain('/repos/ada/engine/contributors')
        const logs = await t.run((ctx) =>
          ctx.db.query('github_sync_log').collect(),
        )
        expect(logs).toHaveLength(1)
        expect(logs[0]).toMatchObject({
          status: 'failed',
          error: 'Repository is no longer public',
        })
        const token = await t.run((ctx) =>
          ctx.db.query('github_tokens').first(),
        )
        expect(token).toMatchObject({ tokenStatus: 'active', lastError: null })
      })
    }

    it(`rejects ${sync} when a repository path resolves to a different stable ID`, async () => {
      const projectId = await existingProject()
      const value = repository('ada/engine', 999)
      value.permissions.admin = true
      repositories.set(value.full_name, value)
      await expect(
        t.action(internal.github_actions[sync], { projectId }),
      ).rejects.toThrow('Repository identity changed')
      const project = await t.run((ctx) => ctx.db.get(projectId))
      expect(project?.github.repoId).toBe(101)
      expect(project?.github.description).toBe('Previously public description')
    })

    it(`rejects ${sync} when the connected GitHub account loses its write relationship`, async () => {
      const projectId = await existingProject()
      const value = repository('ada/engine')
      value.owner.id = 999
      repositories.set(value.full_name, value)
      await expect(
        t.action(internal.github_actions[sync], { projectId }),
      ).rejects.toThrow('Repository is no longer eligible for sync')
      expect(
        fetchMock.mock.calls.map(([url]) => new URL(url).pathname),
      ).not.toContain('/repos/ada/engine/readme')
    })

    it(`keeps ${sync} working for an eligible public repository without requesting /user`, async () => {
      const projectId = await existingProject()
      const value = repository()
      value.permissions.push = true
      repositories.set(value.full_name, value)
      await t.action(internal.github_actions[sync], { projectId })
      expect(
        fetchMock.mock.calls.map(([url]) => new URL(url).pathname),
      ).not.toContain('/user')
      const logs = await t.run((ctx) =>
        ctx.db.query('github_sync_log').collect(),
      )
      expect(logs[0]?.status).toBe('success')
    })
  }
})
