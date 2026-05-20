import type { Doc, Id } from '../../../convex/_generated/dataModel'

export type GithubRepositoryListItem = {
  fullName: string
  primaryLanguage: string | null
  topics: string[]
}

export function deriveStackPrefsFromRepositories(
  repositories: Array<GithubRepositoryListItem>,
) {
  const seen = new Set<string>()
  const stackPrefs: string[] = []

  for (const repository of repositories) {
    const values = [repository.primaryLanguage, ...repository.topics].filter(
      (value): value is string => Boolean(value?.trim()),
    )

    for (const value of values) {
      const trimmed = value.trim()
      const key = trimmed.toLowerCase()

      if (seen.has(key)) {
        continue
      }

      seen.add(key)
      stackPrefs.push(trimmed)
    }
  }

  return stackPrefs
}

export function buildOwnedProjectIdsFromFullNames(
  repoFullNames: string[],
  projects: Array<Pick<Doc<'projects'>, '_id' | 'github'>>,
) {
  const projectByFullName = new Map(
    projects.map((project) => [project.github.fullName, project._id]),
  )

  return repoFullNames.reduce<Id<'projects'>[]>((result, fullName) => {
    const projectId = projectByFullName.get(fullName)
    if (projectId) {
      result.push(projectId)
    }
    return result
  }, [])
}
