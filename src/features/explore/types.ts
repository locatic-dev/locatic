import type { Doc, Id } from '../../../convex/_generated/dataModel'
import type { ProjectCardPreview } from '@/features/contracts'

export type BuilderPreview = {
  userId: Id<'users'>
  displayName: string
  avatarUrl: string | null
  githubUsername: string
  cityId: Id<'cities'> | null
  cityName: string | null
  projectsCount: number
  followersCount: number
}

export type ExploreFeedPayload = {
  scope: 'default' | 'global' | 'custom'
  appliedCityIds: Array<Id<'cities'>>
  isCityFiltered: boolean
  projects: Array<ProjectCardPreview>
}

export type ExploreCityChip = {
  id: string
  name: string
}

export type ExploreCityDoc = Doc<'cities'>
