import type { Doc } from './types'

export function canPinProject(project: Pick<Doc<'projects'>, 'locatic'>) {
  return project.locatic.isVisible
}
