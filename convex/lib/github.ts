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

export type GithubContributor = {
  id: number | null
  login: string
  contributions: number
  type: string
}

export type GithubContributorImport = {
  githubId: number
  githubUsername: string
  commitCount: number
}

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
  readmeAssetBaseUrl: string | null
  readmeAssetRootUrl: string | null
  readmeLinkBaseUrl: string | null
  readmeLinkRootUrl: string | null
}

export type GithubReadmeMetadata = {
  download_url: string | null
  html_url: string | null
  path: string | null
}

export type GithubReadmeUrlBases = Pick<
  GithubRepositoryRecord,
  | 'readmeAssetBaseUrl'
  | 'readmeAssetRootUrl'
  | 'readmeLinkBaseUrl'
  | 'readmeLinkRootUrl'
>

type LegacyGithubReadmeUrlBases = Partial<
  Record<keyof GithubReadmeUrlBases, unknown>
>

export type GithubReadmeImport = {
  markdown: string | null
  metadata: GithubReadmeMetadata | null
}

const MAX_IMPORT_REPOSITORIES = 25
const GITHUB_REPOSITORIES_PER_PAGE = 100
const MAX_REPOSITORY_LIST_PAGES = 10
const MAX_README_PREVIEW_LENGTH = 20_000
const GITHUB_RAW_README_HOST = 'raw.githubusercontent.com'
const HOUR_MS = 60 * 60 * 1000
const CONTRIBUTOR_SYNC_INTERVALS_MS = {
  daily: 24 * HOUR_MS,
  weekly: 7 * 24 * HOUR_MS,
  monthly: 30 * 24 * HOUR_MS,
} as const
export const CONTRIBUTOR_SYNC_RETRY_INTERVAL_MS = 6 * HOUR_MS
const GITHUB_REPOSITORY_FULL_NAME_REGEX =
  /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?\/[A-Za-z0-9._-]{1,100}$/
const EMPTY_README_URL_BASES: GithubReadmeUrlBases = {
  readmeAssetBaseUrl: null,
  readmeAssetRootUrl: null,
  readmeLinkBaseUrl: null,
  readmeLinkRootUrl: null,
}

export function needsGithubReadmeUrlBaseKeyNormalization(
  github: LegacyGithubReadmeUrlBases,
) {
  return (
    github.readmeAssetBaseUrl === undefined ||
    github.readmeAssetRootUrl === undefined ||
    github.readmeLinkBaseUrl === undefined ||
    github.readmeLinkRootUrl === undefined
  )
}

export function normalizeLegacyGithubReadmeUrlBaseKeys(
  github: LegacyGithubReadmeUrlBases,
): GithubReadmeUrlBases {
  return {
    readmeAssetBaseUrl:
      typeof github.readmeAssetBaseUrl === 'string'
        ? github.readmeAssetBaseUrl
        : null,
    readmeAssetRootUrl:
      typeof github.readmeAssetRootUrl === 'string'
        ? github.readmeAssetRootUrl
        : null,
    readmeLinkBaseUrl:
      typeof github.readmeLinkBaseUrl === 'string'
        ? github.readmeLinkBaseUrl
        : null,
    readmeLinkRootUrl:
      typeof github.readmeLinkRootUrl === 'string'
        ? github.readmeLinkRootUrl
        : null,
  }
}

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

export function mapGithubContributorsForImport(
  contributors: GithubContributor[],
): GithubContributorImport[] {
  return contributors.flatMap((contributor) =>
    contributor.id === null || contributor.type !== 'User'
      ? []
      : [
          {
            githubId: contributor.id,
            githubUsername: contributor.login,
            commitCount: contributor.contributions,
          },
        ],
  )
}

export function isProjectContributorSyncDue(args: {
  lastSyncAttemptedAt?: number | null
  lastSyncedAt: number | null
  now: number
  refreshAll?: boolean
  syncCadence: keyof typeof CONTRIBUTOR_SYNC_INTERVALS_MS
}) {
  if (args.refreshAll) {
    return true
  }

  const lastAttemptedAt = args.lastSyncAttemptedAt ?? null
  if (
    lastAttemptedAt !== null &&
    args.now - lastAttemptedAt < CONTRIBUTOR_SYNC_RETRY_INTERVAL_MS
  ) {
    return false
  }

  if (args.lastSyncedAt === null) {
    return true
  }

  return (
    args.now - args.lastSyncedAt >=
    CONTRIBUTOR_SYNC_INTERVALS_MS[args.syncCadence]
  )
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

export function normalizeGithubReadmePreview(readmeMarkdown: string | null) {
  const normalized = readmeMarkdown?.trim()
  if (!normalized) {
    return null
  }

  if (normalized.length <= MAX_README_PREVIEW_LENGTH) {
    return normalized
  }

  return `${normalized.slice(0, MAX_README_PREVIEW_LENGTH).trimEnd()}\n\n...`
}

export function assertGithubRawDownloadUrl(url: string) {
  const parsed = new URL(url)

  if (
    parsed.protocol !== 'https:' ||
    parsed.hostname !== GITHUB_RAW_README_HOST
  ) {
    throw new Error('GitHub README download URL host is not allowed')
  }

  parsed.username = ''
  parsed.password = ''
  return parsed.toString()
}

function directoryBaseUrl(url: string) {
  const lastSlashIndex = url.lastIndexOf('/')
  return lastSlashIndex === -1 ? null : url.slice(0, lastSlashIndex + 1)
}

function stripReadmePathFromUrl(url: string, readmePath: string) {
  if (!url || !readmePath) {
    return null
  }

  try {
    const parsed = new URL(url)
    const encodedReadmePath = readmePath
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/')
    const suffix = `/${encodedReadmePath}`

    if (parsed.pathname.endsWith(suffix)) {
      parsed.pathname = parsed.pathname.slice(0, -suffix.length + 1)
      parsed.search = ''
      parsed.hash = ''
      return parsed.toString()
    }

    const decodedPathname = decodeURIComponent(parsed.pathname)
    const decodedSuffix = `/${readmePath}`

    if (decodedPathname.endsWith(decodedSuffix)) {
      const prefix = decodedPathname.slice(0, -decodedSuffix.length + 1)
      parsed.pathname = prefix
      parsed.search = ''
      parsed.hash = ''
      return parsed.toString()
    }
  } catch {
    return null
  }

  return null
}

export function deriveGithubReadmeUrlBases(
  metadata: GithubReadmeMetadata | null,
): GithubReadmeUrlBases {
  const downloadUrl = metadata?.download_url?.trim() ?? ''
  const htmlUrl = metadata?.html_url?.trim() ?? ''
  const readmePath = metadata?.path?.trim() ?? ''

  if (!downloadUrl || !htmlUrl || !readmePath) {
    return { ...EMPTY_README_URL_BASES }
  }

  return {
    readmeAssetBaseUrl: directoryBaseUrl(downloadUrl),
    readmeAssetRootUrl: stripReadmePathFromUrl(downloadUrl, readmePath),
    readmeLinkBaseUrl: directoryBaseUrl(htmlUrl),
    readmeLinkRootUrl: stripReadmePathFromUrl(htmlUrl, readmePath),
  }
}

export function normalizeGithubReadmeImport(readme: GithubReadmeImport | null) {
  return {
    readmePreview: normalizeGithubReadmePreview(readme?.markdown ?? null),
    ...deriveGithubReadmeUrlBases(readme?.metadata ?? null),
  }
}

export function mapGithubRepository(
  repository: GithubRepository,
  languages: GithubLanguages | null = null,
  readme: GithubReadmeImport | null = null,
): GithubRepositoryRecord {
  const lastCommitAt = new Date(repository.pushed_at).getTime()
  const ownerLogin = repository.owner.login
  const readmeImport = normalizeGithubReadmeImport(readme)

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
    ...readmeImport,
  }
}

export async function mapGithubRepositoryWithOptionalLanguages(args: {
  fetchRepository: () => Promise<GithubRepository>
  fetchLanguages: () => Promise<GithubLanguages>
  fetchReadme?: () => Promise<GithubReadmeImport | null>
}): Promise<GithubRepositoryRecord> {
  const repository = await args.fetchRepository()
  let languages: GithubLanguages | null = null
  let readme: GithubReadmeImport | null = null

  try {
    languages = await args.fetchLanguages()
  } catch {
    languages = null
  }

  try {
    readme = (await args.fetchReadme?.()) ?? null
  } catch {
    readme = null
  }

  return mapGithubRepository(repository, languages, readme)
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
