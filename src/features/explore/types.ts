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

export type ExploreProjectPreview = ProjectCardPreview

export type ExplorePostPreview = Doc<'posts'>

export type ExploreCityChip = {
  id: string
  name: string
}

export type ExploreCityDoc = Doc<'cities'>
