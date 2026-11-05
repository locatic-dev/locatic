// JSON-LD for route heads (schema.org). Each route adds
// `scripts: [jsonLdScript(...)]` to its `head()`; every node is built from
// the same privacy-filtered payloads the page renders.

import { ABOUT_FAQ } from '@/features/about/about-faq-content'
import {
  CONTACT_EMAIL,
  FOUNDERS,
  LOCATIC_DEFINITION,
  githubProfileUrl,
} from '@/features/about/about-content'
import { SITE_URL } from '@/lib/seo'
import { GITHUB_REPO_URL } from '@/lib/site-links'
import { socialLinkHref } from '@/lib/social-links'

export type JsonLdNode = { '@type': string } & Record<string, unknown>

export const ORGANIZATION_ID = `${SITE_URL}/#organization`
export const WEBSITE_ID = `${SITE_URL}/#website`

/**
 * A `<script type="application/ld+json">` for a route's `head().scripts`.
 * Values include user-written text (bios, repository descriptions), so `<`,
 * `>` and `&` are escaped as JSON unicode escapes: the data parses to the
 * same values, and no value can end the script element.
 */
export function jsonLdScript(nodes: JsonLdNode | JsonLdNode[]) {
  const data = Array.isArray(nodes)
    ? { '@context': 'https://schema.org', '@graph': nodes }
    : { '@context': 'https://schema.org', ...nodes }
  return {
    type: 'application/ld+json',
    children: JSON.stringify(data)
      .replace(/</g, '\\u003c')
      .replace(/>/g, '\\u003e')
      .replace(/&/g, '\\u0026'),
  }
}

/** Locatic itself; other nodes point at it by `@id`. */
export function organizationNode(): JsonLdNode {
  return {
    '@type': 'Organization',
    '@id': ORGANIZATION_ID,
    name: 'Locatic',
    url: SITE_URL,
    logo: `${SITE_URL}/icon-512.png`,
    description: LOCATIC_DEFINITION,
    email: CONTACT_EMAIL,
    sameAs: [GITHUB_REPO_URL],
    founder: FOUNDERS.map((founder) => ({
      '@type': 'Person',
      name: founder.name,
      sameAs: githubProfileUrl(founder.github),
    })),
  }
}

export function websiteNode(): JsonLdNode {
  return {
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    name: 'Locatic',
    url: SITE_URL,
    description: LOCATIC_DEFINITION,
    publisher: { '@id': ORGANIZATION_ID },
  }
}

export function aboutPageNode(): JsonLdNode {
  return {
    '@type': 'AboutPage',
    url: `${SITE_URL}/about`,
    name: 'About Locatic',
    isPartOf: { '@id': WEBSITE_ID },
    mainEntity: { '@id': ORGANIZATION_ID },
  }
}

/** The /about questions and answers, word for word as the page shows them. */
export function faqPageNode(): JsonLdNode {
  return {
    '@type': 'FAQPage',
    url: `${SITE_URL}/about`,
    mainEntity: ABOUT_FAQ.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  }
}

type SocialLinks = {
  github: string
  x: string | null
  linkedin: string | null
  bluesky: string | null
  website: string | null
}

/** A profile as the public overview discloses it (`users.publicProfileOverview`). */
export type ProfileStructuredData = {
  githubUsername: string
  profile: {
    displayName: string
    bio: string
    avatarUrl: string
    socialLinks: SocialLinks
    location:
      | { kind: 'city'; cityName: string }
      | { kind: 'region'; regionLabel: string }
      | { kind: 'none' }
  }
  stats: { followersCount: number }
}

/**
 * ProfilePage + Person for /u/{username}. Built only from the public
 * overview, which the server already filtered: the place is the builder's
 * own disclosure (city, region, or nothing), never the raw profile city.
 */
export function profilePageNode(overview: ProfileStructuredData): JsonLdNode {
  const url = `${SITE_URL}/u/${overview.githubUsername}`
  const { profile } = overview
  const location = profile.location
  const placeName =
    location.kind === 'city'
      ? location.cityName
      : location.kind === 'region'
        ? location.regionLabel
        : null
  const sameAs = [
    githubProfileUrl(overview.githubUsername),
    ...(['x', 'linkedin', 'bluesky', 'website'] as const).flatMap(
      (platform) => {
        const href = socialLinkHref(platform, profile.socialLinks[platform])
        return href ? [href] : []
      },
    ),
  ]
  return {
    '@type': 'ProfilePage',
    url,
    isPartOf: { '@id': WEBSITE_ID },
    mainEntity: {
      '@type': 'Person',
      '@id': `${url}#person`,
      name: profile.displayName,
      alternateName: `@${overview.githubUsername}`,
      identifier: overview.githubUsername,
      url,
      ...(profile.bio.trim() ? { description: profile.bio.trim() } : {}),
      ...(profile.avatarUrl ? { image: profile.avatarUrl } : {}),
      sameAs,
      ...(placeName
        ? { homeLocation: { '@type': 'Place', name: placeName } }
        : {}),
      interactionStatistic: {
        '@type': 'InteractionCounter',
        interactionType: 'https://schema.org/FollowAction',
        userInteractionCount: overview.stats.followersCount,
      },
    },
  }
}

/** A project as its public page shows it, plus the owner's disclosed city. */
export type ProjectStructuredData = {
  /** The page path's owner and repo (the canonical route). */
  owner: string
  repo: string
  fullName: string
  description: string | null
  primaryLanguage: string | null
  topics: string[]
  lastCommitAt: number
  ownerName: string
  ownerUsername: string
  /** Set only when the owner discloses their exact city. */
  city: { name: string; slug: string } | null
}

/**
 * SoftwareSourceCode and its breadcrumb trail for a project page. The author
 * is identified by GitHub, not by their Locatic profile, which may be closed
 * to visitors.
 */
export function projectNodes(project: ProjectStructuredData): JsonLdNode[] {
  const url = `${SITE_URL}/project/${project.owner}/${project.repo}`
  const crumbs = [
    { name: 'Locatic', item: SITE_URL },
    ...(project.city
      ? [
          {
            name: project.city.name,
            item: `${SITE_URL}/c/${project.city.slug}`,
          },
        ]
      : []),
    { name: project.fullName, item: url },
  ]
  return [
    {
      '@type': 'SoftwareSourceCode',
      '@id': `${url}#code`,
      name: project.repo,
      url,
      codeRepository: `https://github.com/${project.fullName}`,
      ...(project.description ? { description: project.description } : {}),
      ...(project.primaryLanguage
        ? { programmingLanguage: project.primaryLanguage }
        : {}),
      ...(project.topics.length > 0
        ? { keywords: project.topics.join(', ') }
        : {}),
      dateModified: new Date(project.lastCommitAt).toISOString(),
      author: {
        '@type': 'Person',
        name: project.ownerName,
        sameAs: githubProfileUrl(project.ownerUsername),
      },
      isPartOf: { '@id': WEBSITE_ID },
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: crumbs.map((crumb, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        ...crumb,
      })),
    },
  ]
}

/** A city page's public data: the place and its recent work. */
export type CityStructuredData = {
  slug: string
  name: string
  displayName: string
  location: { lat: number; lng: number }
  projects: Array<{ owner: string; repo: string; fullName: string }>
}

/**
 * CollectionPage of a city's recent public projects. The coordinates are the
 * catalogue city's, already public on the landing and city maps.
 */
export function cityPageNode(city: CityStructuredData): JsonLdNode {
  return {
    '@type': 'CollectionPage',
    name: `Developers and projects in ${city.name}`,
    url: `${SITE_URL}/c/${city.slug}`,
    isPartOf: { '@id': WEBSITE_ID },
    about: {
      '@type': 'Place',
      name: city.displayName,
      geo: {
        '@type': 'GeoCoordinates',
        latitude: city.location.lat,
        longitude: city.location.lng,
      },
    },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: city.projects.length,
      itemListElement: city.projects.map((project, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: project.fullName,
        url: `${SITE_URL}/project/${project.owner}/${project.repo}`,
      })),
    },
  }
}
