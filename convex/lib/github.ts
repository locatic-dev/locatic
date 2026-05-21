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
  name: string
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

  return {
    repoId: repository.id,
    fullName: repository.full_name,
    name: repository.name,
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
