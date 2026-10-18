import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DESCRIPTION,
  DEFAULT_TITLE,
  SOCIAL_IMAGE,
  seo,
  truncateDescription,
} from '../seo'

function metaContent(
  meta: ReturnType<typeof seo>['meta'],
  key: string,
): string | undefined {
  for (const tag of meta) {
    if (
      ('name' in tag && tag.name === key) ||
      ('property' in tag && tag.property === key)
    ) {
      return tag.content
    }
  }
  return undefined
}

describe('seo', () => {
  it('uses the site defaults without a title', () => {
    const { meta, links } = seo({})
    expect(meta).toContainEqual({ title: DEFAULT_TITLE })
    expect(metaContent(meta, 'description')).toBe(DEFAULT_DESCRIPTION)
    expect(metaContent(meta, 'og:url')).toBeUndefined()
    expect(links).toEqual([])
  })

  it('appends the site name and sets the canonical URL from the path', () => {
    const { meta, links } = seo({
      title: 'berlin',
      description: 'Builders in Berlin.',
      path: '/c/berlin',
    })
    expect(meta).toContainEqual({ title: 'berlin · Locatic' })
    expect(metaContent(meta, 'og:title')).toBe('berlin · Locatic')
    expect(metaContent(meta, 'twitter:description')).toBe('Builders in Berlin.')
    expect(metaContent(meta, 'og:url')).toBe('https://locatic.dev/c/berlin')
    expect(links).toEqual([
      { rel: 'canonical', href: 'https://locatic.dev/c/berlin' },
    ])
  })

  it('leads the default title and description with what Locatic is for', () => {
    expect(DEFAULT_TITLE).toBe(
      'Locatic: find developers and projects in your city',
    )
    expect(DEFAULT_DESCRIPTION).toMatch(
      /^Locatic is a social network for developers/,
    )
    expect(DEFAULT_DESCRIPTION.length).toBeLessThanOrEqual(160)
  })

  it('marks profiles with og:type profile and the username', () => {
    const { meta } = seo({
      title: 'x',
      path: '/u/x',
      type: 'profile',
      username: 'x',
    })
    expect(metaContent(meta, 'og:type')).toBe('profile')
    expect(metaContent(meta, 'profile:username')).toBe('x')
    expect(metaContent(seo({ path: '/' }).meta, 'og:type')).toBe('website')
    expect(metaContent(seo({ path: '/' }).meta, 'profile:username')).toBe(
      undefined,
    )
  })

  it('keeps thin pages out of the index but follows their links', () => {
    const { meta, links } = seo({ title: 'x', path: '/c/x', thin: true })
    expect(meta).toContainEqual({ name: 'robots', content: 'noindex, follow' })
    // Link previews still work.
    expect(metaContent(meta, 'og:title')).toBe('x · Locatic')
    expect(links).toEqual([])
  })

  it('declares the social image with its real size', () => {
    const { meta } = seo({ path: '/' })
    expect(metaContent(meta, 'og:image')).toBe(SOCIAL_IMAGE.url)
    expect(metaContent(meta, 'og:image:width')).toBe('1200')
    expect(metaContent(meta, 'og:image:height')).toBe('630')
    expect(metaContent(meta, 'twitter:card')).toBe('summary_large_image')
    const file = new URL(
      `../../../public${new URL(SOCIAL_IMAGE.url).pathname}`,
      import.meta.url,
    )
    expect(existsSync(file)).toBe(true)
  })

  it('emits only a title and robots tag for noindex pages', () => {
    const { meta, links } = seo({
      title: 'settings',
      path: '/settings',
      noindex: true,
    })
    expect(meta).toEqual([
      { title: 'settings · Locatic' },
      { name: 'robots', content: 'noindex, nofollow' },
    ])
    expect(links).toEqual([])
  })
})

describe('truncateDescription', () => {
  it('keeps short text and collapses whitespace', () => {
    expect(truncateDescription('  shipping\n a  cli  ')).toBe('shipping a cli')
  })

  it('cuts long text on a word boundary', () => {
    const text = 'word '.repeat(60)
    const result = truncateDescription(text, 40)
    expect(result.length).toBeLessThanOrEqual(40)
    expect(result.endsWith('word…')).toBe(true)
  })
})
