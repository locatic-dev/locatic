import { defaultUrlTransform } from 'react-markdown'

export type GithubReadmeUrlBases = {
  readmeAssetBaseUrl?: string | null
  readmeAssetRootUrl?: string | null
  readmeLinkBaseUrl?: string | null
  readmeLinkRootUrl?: string | null
}

type ResolveGithubReadmeMarkdownUrlArgs = {
  bases: GithubReadmeUrlBases
  kind: 'asset' | 'link'
  url: string
}

function isAbsoluteWebUrl(url: string) {
  return /^https?:\/\//i.test(url)
}

function hasProtocol(url: string) {
  return /^[A-Za-z][A-Za-z0-9+.-]*:/.test(url)
}

function isSafeTelephoneLink(url: string) {
  return /^tel:\+?[0-9().\-\s]+$/i.test(url)
}

function toTreeUrlForDirectoryLink(url: string, sourceUrl: string) {
  if (!sourceUrl.split(/[?#]/, 1)[0]?.endsWith('/')) {
    return url
  }

  try {
    const parsed = new URL(url)
    parsed.pathname = parsed.pathname.replace('/blob/', '/tree/')
    return parsed.toString()
  } catch {
    return url
  }
}

function resolveWithBase(url: string, baseUrl: string | null | undefined) {
  if (!baseUrl) {
    return url
  }

  try {
    return new URL(url, baseUrl).toString()
  } catch {
    return ''
  }
}

export function resolveGithubReadmeMarkdownUrl({
  bases,
  kind,
  url,
}: ResolveGithubReadmeMarkdownUrlArgs) {
  const trimmed = url.trim()

  if (!trimmed) {
    return ''
  }

  if (trimmed.startsWith('#')) {
    return defaultUrlTransform(trimmed)
  }

  const normalized = trimmed.startsWith('//') ? `https:${trimmed}` : trimmed

  if (isAbsoluteWebUrl(normalized)) {
    return defaultUrlTransform(normalized)
  }

  if (hasProtocol(normalized)) {
    if (kind === 'link' && isSafeTelephoneLink(normalized)) {
      return normalized
    }

    if (kind === 'link' && /^mailto:/i.test(normalized)) {
      return defaultUrlTransform(normalized)
    }

    return ''
  }

  const baseUrl = normalized.startsWith('/')
    ? kind === 'asset'
      ? bases.readmeAssetRootUrl
      : bases.readmeLinkRootUrl
    : kind === 'asset'
      ? bases.readmeAssetBaseUrl
      : bases.readmeLinkBaseUrl
  const path = normalized.startsWith('/') ? normalized.slice(1) : normalized
  const resolved = resolveWithBase(path, baseUrl)

  if (!resolved) {
    return ''
  }

  const linkUrl =
    kind === 'link' ? toTreeUrlForDirectoryLink(resolved, normalized) : resolved

  return defaultUrlTransform(linkUrl)
}
