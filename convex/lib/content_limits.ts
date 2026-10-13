import { ConvexError } from 'convex/values'

/**
 * Maximum lengths for user-written text, in UTF-16 code units (what
 * `String.length` and the HTML `maxLength` attribute count). Mutations
 * enforce them; forms import the same constants for `maxLength` so a user
 * never types past what the server accepts.
 */
export const CONTENT_LIMITS = {
  displayName: 64,
  bio: 140,
  socialLink: 2048,
  comment: 2000,
  post: 5000,
  message: 4000,
  reportDetails: 1000,
} as const

type ContentLimitField = keyof typeof CONTENT_LIMITS

const FIELD_LABELS: Record<ContentLimitField, string> = {
  displayName: 'Display name',
  bio: 'Bio',
  socialLink: 'Social link',
  comment: 'Comment',
  post: 'Post',
  message: 'Message',
  reportDetails: 'Report details',
}

/** Throws a user-facing ConvexError when `value` is longer than its limit. */
export function assertMaxLength(
  field: ContentLimitField,
  value: string | null | undefined,
) {
  const max = CONTENT_LIMITS[field]
  if (value && value.length > max) {
    throw new ConvexError(
      `${FIELD_LABELS[field]} must be ${max.toLocaleString('en-US')} characters or fewer`,
    )
  }
}

type SocialLinksInput = {
  github: string
  x: string | null
  linkedin: string | null
  bluesky: string | null
  website: string | null
}

export function assertProfileTextLimits(args: {
  displayName: string
  bio: string
  socialLinks?: SocialLinksInput
}) {
  assertMaxLength('displayName', args.displayName)
  assertMaxLength('bio', args.bio)
  if (args.socialLinks) {
    for (const link of Object.values(args.socialLinks)) {
      assertMaxLength('socialLink', link)
    }
  }
}
