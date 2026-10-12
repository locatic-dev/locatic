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

const SEGMENT = /^[^/\s]+$/

/**
 * Reads a project reference an admin might paste: `owner/repo`, a GitHub
 * repository URL (with or without scheme, `.git`, or a deeper path), or a
 * Locatic project URL (`…/project/owner/repo`). Returns null for anything
 * else, such as a bare search term.
 */
export function parseProjectReference(
  input: string,
): { owner: string; repo: string } | null {
  const value = input.trim().replace(/\/+$/, '')
  if (!value || /\s/.test(value)) return null
  // `owner/repo`; a first segment that looks like a host is a URL instead.
  const plain = value.split('/')
  if (plain.length === 2 && !value.includes(':') && !/\.\w+$/.test(plain[0]!)) {
    const owner = plain[0]!
    const repo = plain[1]!.replace(/\.git$/i, '')
    return SEGMENT.test(owner) && SEGMENT.test(repo) ? { owner, repo } : null
  }
  let parts: string[]
  let url: URL
  try {
    url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`)
    // A malformed escape (`%E0`) throws; treat it as a plain search term.
    parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)
  } catch {
    return null
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, '')
  if (host === 'github.com' && parts.length >= 2) {
    return { owner: parts[0]!, repo: parts[1]!.replace(/\.git$/i, '') }
  }
  const projectAt = parts.indexOf('project')
  if (projectAt >= 0 && parts.length === projectAt + 3) {
    return { owner: parts[projectAt + 1]!, repo: parts[projectAt + 2]! }
  }
  return null
}
