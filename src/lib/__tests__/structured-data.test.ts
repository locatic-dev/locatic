import { describe, expect, it } from 'vitest'
import {
  ORGANIZATION_ID,
  cityPageNode,
  faqPageNode,
  jsonLdScript,
  organizationNode,
  profilePageNode,
  projectNodes,
  type ProfileStructuredData,
  type ProjectStructuredData,
} from '../structured-data'
import { ABOUT_FAQ } from '@/features/about/about-faq-content'

const profile = (
  location: ProfileStructuredData['profile']['location'],
  overrides: Partial<ProfileStructuredData['profile']> = {},
): ProfileStructuredData => ({
  githubUsername: 'ada',
  profile: {
    displayName: 'Ada',
    bio: '',
    avatarUrl: '',
    socialLinks: {
      github: 'ada',
      x: 'ada_x',
      linkedin: 'https://example.com/not-linkedin',
      bluesky: null,
      website: 'ada.dev',
    },
    location,
    ...overrides,
  },
  stats: { followersCount: 4 },
})

const project: ProjectStructuredData = {
  owner: 'ada',
  repo: 'engine',
  fullName: 'ada/engine',
  description: 'An engine',
  primaryLanguage: 'Go',
  topics: ['cli', 'tui'],
  lastCommitAt: Date.UTC(2026, 9, 1),
  ownerName: 'Ada',
  ownerUsername: 'ada',
  city: { name: 'Bengaluru', slug: 'bengaluru-in' },
}

describe('jsonLdScript', () => {
  it('escapes markup so user text cannot close the script tag', () => {
    const script = jsonLdScript({ '@type': 'Thing', name: '</script><b>&' })
    expect(script.type).toBe('application/ld+json')
    expect(script.children).not.toMatch(/[<>&]/)
    expect(JSON.parse(script.children)).toEqual({
      '@context': 'https://schema.org',
      '@type': 'Thing',
      name: '</script><b>&',
    })
  })

  it('wraps several nodes in a graph', () => {
    const data = JSON.parse(
      jsonLdScript([{ '@type': 'A' }, { '@type': 'B' }]).children,
    )
    expect(
      data['@graph'].map((node: { '@type': string }) => node['@type']),
    ).toEqual(['A', 'B'])
  })
})

describe('site nodes', () => {
  it('describes the organisation with its founders and GitHub', () => {
    const org = organizationNode()
    expect(org['@id']).toBe(ORGANIZATION_ID)
    expect(org.sameAs).toEqual(['https://github.com/locatic-dev/locatic'])
    expect(org.founder).toContainEqual({
      '@type': 'Person',
      name: 'Avinash Changrani',
      sameAs: 'https://github.com/nabobery',
    })
  })

  it('repeats the /about answers word for word', () => {
    const faq = faqPageNode() as unknown as {
      mainEntity: Array<{ name: string }>
    }
    expect(faq.mainEntity.map((question) => question.name)).toEqual(
      ABOUT_FAQ.map((item) => item.question),
    )
  })
})

describe('profilePageNode', () => {
  const person = (data: ProfileStructuredData) =>
    profilePageNode(data).mainEntity as Record<string, unknown>

  it('places an exact-city builder in their city', () => {
    expect(
      person(profile({ kind: 'city', cityName: 'Bengaluru, India' }))
        .homeLocation,
    ).toEqual({ '@type': 'Place', name: 'Bengaluru, India' })
  })

  it('places a region-only builder in their region', () => {
    expect(
      person(profile({ kind: 'region', regionLabel: 'Karnataka, India' }))
        .homeLocation,
    ).toEqual({ '@type': 'Place', name: 'Karnataka, India' })
  })

  it('gives a hidden location no place', () => {
    expect(person(profile({ kind: 'none' }))).not.toHaveProperty('homeLocation')
  })

  it('links GitHub and valid social profiles only', () => {
    expect(person(profile({ kind: 'none' })).sameAs).toEqual([
      'https://github.com/ada',
      'https://x.com/ada_x',
      'https://ada.dev/',
    ])
  })

  it('keeps an empty bio and avatar out', () => {
    const node = person(profile({ kind: 'none' }))
    expect(node).not.toHaveProperty('description')
    expect(node).not.toHaveProperty('image')
  })
})

describe('projectNodes', () => {
  it('describes the code and adds a city crumb for exact-city owners', () => {
    const [code, breadcrumbs] = projectNodes(project)
    expect(code).toMatchObject({
      '@type': 'SoftwareSourceCode',
      codeRepository: 'https://github.com/ada/engine',
      programmingLanguage: 'Go',
      keywords: 'cli, tui',
      author: { name: 'Ada', sameAs: 'https://github.com/ada' },
    })
    expect(
      (breadcrumbs!.itemListElement as Array<{ item: string }>).map(
        (crumb) => crumb.item,
      ),
    ).toEqual([
      'https://locatic.dev',
      'https://locatic.dev/c/bengaluru-in',
      'https://locatic.dev/project/ada/engine',
    ])
  })

  it('skips the city crumb when the owner discloses none', () => {
    const [, breadcrumbs] = projectNodes({ ...project, city: null })
    expect(breadcrumbs?.itemListElement).toHaveLength(2)
  })

  it('never points at the owner’s Locatic profile', () => {
    expect(JSON.stringify(projectNodes(project))).not.toContain('/u/')
  })
})

describe('cityPageNode', () => {
  it('lists recent projects in order', () => {
    const node = cityPageNode({
      slug: 'bengaluru-in',
      name: 'Bengaluru',
      displayName: 'Bengaluru, Karnataka, India',
      location: { lat: 12.97, lng: 77.59 },
      projects: [{ owner: 'ada', repo: 'engine', fullName: 'ada/engine' }],
    })
    expect(node.mainEntity).toEqual({
      '@type': 'ItemList',
      numberOfItems: 1,
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'ada/engine',
          url: 'https://locatic.dev/project/ada/engine',
        },
      ],
    })
  })
})
