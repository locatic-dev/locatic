import { BrandIcon } from './brand-icon'
import { socialLinkHref } from '@/lib/social-links'
import { cn } from '@/lib/utils'

export type SocialLinkValues = {
  x: string | null
  linkedin: string | null
  bluesky: string | null
  website: string | null
}

/** GitHub, X, LinkedIn and Bluesky as icons, the website as a label. */
export function SocialLinks({
  githubUsername,
  links,
  className,
}: {
  githubUsername: string
  links: SocialLinkValues
  className?: string
}) {
  const items = [
    {
      href: socialLinkHref('github', githubUsername),
      label: 'github profile',
      content: <BrandIcon name="github" size={16} />,
      // Derived from the verified GitHub account, not typed by the member.
      userSupplied: false,
    },
    {
      href: socialLinkHref('x', links.x),
      label: 'x profile',
      content: <BrandIcon name="twitter" size={16} />,
      userSupplied: true,
    },
    {
      href: socialLinkHref('linkedin', links.linkedin),
      label: 'linkedin profile',
      content: <BrandIcon name="linkedin" size={16} />,
      userSupplied: true,
    },
    {
      href: socialLinkHref('bluesky', links.bluesky),
      label: 'bluesky profile',
      content: <BrandIcon name="bluesky" size={16} />,
      userSupplied: true,
    },
    {
      href: socialLinkHref('website', links.website),
      label: undefined,
      content: 'website',
      userSupplied: true,
    },
  ].filter((item) => item.href)

  if (items.length === 0) return null

  return (
    <span
      className={cn(
        'inline-flex flex-wrap items-center text-text-muted',
        className,
      )}
    >
      {items.map((item) => (
        <a
          key={item.href}
          href={item.href ?? undefined}
          target="_blank"
          // Member-entered links carry no endorsement (nofollow ugc).
          rel={
            item.userSupplied
              ? 'noopener noreferrer nofollow ugc'
              : 'noopener noreferrer'
          }
          aria-label={item.label}
          className={cn(
            'inline-flex items-center justify-center rounded-control font-mono text-label no-underline transition-colors hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
            // Icons are 32px squares (44px on touch); the text label sizes to
            // its word.
            item.label === undefined
              ? 'h-8 w-auto px-1.5 pointer-coarse:h-11'
              : 'size-8 pointer-coarse:size-11',
          )}
        >
          {item.content}
        </a>
      ))}
    </span>
  )
}
