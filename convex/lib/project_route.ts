export function normalizeProjectRouteKey(value: string) {
  return value.trim().toLowerCase()
}

export function getOwnerLoginFromFullName(fullName: string) {
  return fullName.split('/')[0] ?? fullName
}

export function resolveProjectOwnerLogin(project: {
  github: {
    fullName: string
    ownerLogin?: string
  }
}) {
  return (
    project.github.ownerLogin ??
    getOwnerLoginFromFullName(project.github.fullName)
  )
}

export function resolveProjectSnapshotOwnerLogin(snapshot: {
  fullName: string
  ownerLogin?: string
}) {
  return snapshot.ownerLogin ?? getOwnerLoginFromFullName(snapshot.fullName)
}
