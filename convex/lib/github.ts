export type GithubContributionCalendar = {
  totalContributions: number
  weeks: Array<{
    days: Array<{
      date: string
      count: number
    }>
  }>
}

export type GithubLanguages = Record<string, number>

export type GithubRepository = {
  id: number
  full_name: string
  name: string
  owner: {
    login: string
  }
  description: string | null
  html_url: string
  homepage: string | null
  language: string | null
  topics?: string[]
  stargazers_count: number
  pushed_at: string
}

export type GithubRepositoryRecord = {
  repoId: number
  fullName: string
  ownerLogin: string
  ownerLoginKey: string
  name: string
  nameKey: string
  description: string | null
  githubUrl: string
  projectUrl: string | null
  primaryLanguage: string | null
  languages: Array<{
    name: string
    bytes: number
  }>
  topics: string[]
  stargazersCount: number
  lastCommitAt: number
  lastMetadataSyncedAt: number
  readmePreview: string | null
}

const MAX_IMPORT_REPOSITORIES = 25
const GITHUB_REPOSITORIES_PER_PAGE = 100
const MAX_REPOSITORY_LIST_PAGES = 10
const GITHUB_REPOSITORY_FULL_NAME_REGEX =
  /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?\/[A-Za-z0-9._-]{1,100}$/

export function normalizeRepositoryFullNames(fullNames: string[]) {
  const normalized: string[] = []
  const seen = new Set<string>()

  for (const fullName of fullNames) {
    const trimmed = fullName.trim()
    if (!trimmed || !GITHUB_REPOSITORY_FULL_NAME_REGEX.test(trimmed)) {
      throw new Error('Repository names must use owner/repo format')
    }

    const dedupeKey = trimmed.toLowerCase()
    if (seen.has(dedupeKey)) {
      continue
    }

    seen.add(dedupeKey)
    normalized.push(trimmed)
  }

  if (normalized.length === 0) {
    throw new Error('Select at least one repository to import')
  }

  if (normalized.length > MAX_IMPORT_REPOSITORIES) {
    throw new Error(
      `Select ${MAX_IMPORT_REPOSITORIES} or fewer repositories at a time`,
    )
  }

  return normalized
}

export function encodeRepositoryFullNamePath(fullName: string) {
  const [owner, repo] = fullName.split('/')
  if (!owner || !repo) {
    throw new Error('Repository names must use owner/repo format')
  }

  return `${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
}

export async function listGithubRepositoryPages<T>(args: {
  fetchPage: (page: number, perPage: number) => Promise<T[]>
  maxPages?: number
  perPage?: number
}) {
  const perPage = args.perPage ?? GITHUB_REPOSITORIES_PER_PAGE
  const maxPages = args.maxPages ?? MAX_REPOSITORY_LIST_PAGES
  const repositories: T[] = []

  for (let page = 1; page <= maxPages; page += 1) {
    const pageItems = await args.fetchPage(page, perPage)
    repositories.push(...pageItems)

    if (pageItems.length < perPage) {
      break
    }
  }

  return repositories
}

export function mapGithubLanguages(languages: GithubLanguages | null) {
  if (!languages) {
    return []
  }

  return Object.entries(languages)
    .map(([name, bytes]) => ({ name, bytes }))
    .filter((language) => language.name.trim().length > 0 && language.bytes > 0)
    .sort((left, right) => right.bytes - left.bytes)
    .slice(0, 3)
}

export function mapGithubRepository(
  repository: GithubRepository,
  languages: GithubLanguages | null = null,
): GithubRepositoryRecord {
  const lastCommitAt = new Date(repository.pushed_at).getTime()
  const ownerLogin = repository.owner.login

  return {
    repoId: repository.id,
    fullName: repository.full_name,
    ownerLogin,
    ownerLoginKey: ownerLogin.trim().toLowerCase(),
    name: repository.name,
    nameKey: repository.name.trim().toLowerCase(),
    description: repository.description,
    githubUrl: repository.html_url,
    projectUrl: repository.homepage,
    primaryLanguage: repository.language,
    languages: mapGithubLanguages(languages),
    topics: repository.topics ?? [],
    stargazersCount: repository.stargazers_count,
    lastCommitAt,
    lastMetadataSyncedAt: Date.now(),
    readmePreview: repository.description,
  }
}

export async function mapGithubRepositoryWithOptionalLanguages(args: {
  fetchRepository: () => Promise<GithubRepository>
  fetchLanguages: () => Promise<GithubLanguages>
}): Promise<GithubRepositoryRecord> {
  const repository = await args.fetchRepository()
  let languages: GithubLanguages | null = null

  try {
    languages = await args.fetchLanguages()
  } catch {
    languages = null
  }

  return mapGithubRepository(repository, languages)
}

type GithubContributionGraphResponse = {
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
  } | null
}

export function extractContributionCalendar(
  result: GithubContributionGraphResponse,
): GithubContributionCalendar | null {
  const calendar = result.user?.contributionsCollection.contributionCalendar
  if (!calendar) {
    return null
  }

  return {
    totalContributions: calendar.totalContributions,
    weeks: calendar.weeks.map((week) => ({
      days: week.contributionDays.map((day) => ({
        date: day.date,
        count: day.contributionCount,
      })),
    })),
  }
}
