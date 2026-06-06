import { describe, expect, it } from 'vitest'

import {
  resolveGithubReadmeMarkdownUrl,
  type GithubReadmeUrlBases,
} from '../github-readme-url'

const bases: GithubReadmeUrlBases = {
  readmeAssetBaseUrl:
    'https://raw.githubusercontent.com/owner/repo/main/docs/setup/',
  readmeAssetRootUrl: 'https://raw.githubusercontent.com/owner/repo/main/',
  readmeLinkBaseUrl: 'https://github.com/owner/repo/blob/main/docs/setup/',
  readmeLinkRootUrl: 'https://github.com/owner/repo/blob/main/',
}

function resolveAsset(url: string) {
  return resolveGithubReadmeMarkdownUrl({ bases, kind: 'asset', url })
}

function resolveLink(url: string) {
  return resolveGithubReadmeMarkdownUrl({ bases, kind: 'link', url })
}

describe('resolveGithubReadmeMarkdownUrl', () => {
  it('resolves relative README images against the raw README directory', () => {
    expect(resolveAsset('assets/screenshot.png')).toBe(
      'https://raw.githubusercontent.com/owner/repo/main/docs/setup/assets/screenshot.png',
    )
  })

  it('resolves root-relative README images against the raw repository root', () => {
    expect(resolveAsset('/assets/logo.png')).toBe(
      'https://raw.githubusercontent.com/owner/repo/main/assets/logo.png',
    )
  })

  it('resolves parent-directory paths from the README directory', () => {
    expect(resolveAsset('../images/demo.png')).toBe(
      'https://raw.githubusercontent.com/owner/repo/main/docs/images/demo.png',
    )
  })

  it('leaves absolute web URLs unchanged and normalizes protocol-relative URLs', () => {
    expect(resolveAsset('https://cdn.example.com/image.png')).toBe(
      'https://cdn.example.com/image.png',
    )
    expect(resolveAsset('//cdn.example.com/image.png')).toBe(
      'https://cdn.example.com/image.png',
    )
  })

  it('keeps README fragment links local', () => {
    expect(resolveLink('#installation')).toBe('#installation')
  })

  it('allows mail and phone links for anchors', () => {
    expect(resolveLink('mailto:hello@example.com')).toBe(
      'mailto:hello@example.com',
    )
    expect(resolveLink('tel:+15551234567')).toBe('tel:+15551234567')
  })

  it('blocks unsafe protocols', () => {
    expect(resolveLink('javascript:alert(1)')).toBe('')
    expect(resolveLink('tel:javascript:alert(1)')).toBe('')
    expect(resolveAsset('data:image/svg+xml,<svg></svg>')).toBe('')
  })

  it('preserves query strings and fragments', () => {
    expect(resolveAsset('assets/demo.png?raw=1#preview')).toBe(
      'https://raw.githubusercontent.com/owner/repo/main/docs/setup/assets/demo.png?raw=1#preview',
    )
  })

  it('resolves relative README links to GitHub blob pages', () => {
    expect(resolveLink('CONTRIBUTING.md')).toBe(
      'https://github.com/owner/repo/blob/main/docs/setup/CONTRIBUTING.md',
    )
  })

  it('resolves directory links to GitHub tree pages', () => {
    expect(resolveLink('/docs/')).toBe(
      'https://github.com/owner/repo/tree/main/docs/',
    )
  })
})
