import type { Id } from '../_generated/dataModel'

export type PulseScopeType = 'city' | 'global'
export type PulseTimeWindow = 'day' | 'week' | 'month'
export type PulseSort = 'locatic_likes' | 'comments' | 'github_stars'

export interface PulseProjectSnapshot {
  name: string
  fullName: string
  ownerLogin: string
  description: string | null
  primaryLanguage: string | null
  languages: Array<{
    name: string
    bytes: number
  }>
  likesCount: number
  commentsCount: number
  stargazersCount: number
  ownerId: Id<'users'>
  ownerDisplayName: string
  ownerAvatarUrl: string
  cityId: Id<'cities'> | null
  cityName: string | null
}

export interface PulseProjectInput {
  projectId: string
  projectSnapshot: PulseProjectSnapshot
  likesCount: number
  commentsCount: number
  stargazersCount: number
}

interface BuildPulseSnapshotRowsOptions {
  scopeType: PulseScopeType
  scopeId: string | null
  timeWindow: PulseTimeWindow
  sort: PulseSort
  projects: PulseProjectInput[]
  computedAt: number
}

export interface PulseSnapshotRow {
  scopeType: PulseScopeType
  scopeId: string | null
  timeWindow: PulseTimeWindow
  sort: PulseSort
  rank: number
  score: number
  projectId: string
  projectSnapshot: PulseProjectSnapshot
  computedAt: number
}

function getScore(project: PulseProjectInput, sort: PulseSort): number {
  switch (sort) {
    case 'comments':
      return project.commentsCount
    case 'github_stars':
      return project.stargazersCount
    case 'locatic_likes':
    default:
      return project.likesCount
  }
}

export function buildPulseSnapshotRows({
  scopeType,
  scopeId,
  timeWindow,
  sort,
  projects,
  computedAt,
}: BuildPulseSnapshotRowsOptions): PulseSnapshotRow[] {
  return [...projects]
    .sort((left, right) => getScore(right, sort) - getScore(left, sort))
    .map((project, index) => ({
      scopeType,
      scopeId,
      timeWindow,
      sort,
      rank: index + 1,
      score: getScore(project, sort),
      projectId: project.projectId,
      projectSnapshot: project.projectSnapshot,
      computedAt,
    }))
}
