import { expect, it } from 'vitest'
import { createDefaultViewerProfile } from '../../../convex/lib/viewer'
import { PRIVACY_MARKDOWN } from './privacy-content'
import { TERMS_MARKDOWN } from './terms-content'

it('describes the implemented update defaults consistently across both policies', () => {
  const defaults = createDefaultViewerProfile({
    clerkId: 'test',
    email: 'qa@example.test',
    githubId: 1,
    githubUsername: 'qa',
    githubUrl: 'https://github.com/qa',
    avatarUrl: '',
    displayName: 'QA',
  })
  expect(defaults.notificationPrefs).toMatchObject({
    productUpdates: true,
    weeklyDigest: false,
  })
  for (const policy of [PRIVACY_MARKDOWN, TERMS_MARKDOWN]) {
    expect(policy).toContain(
      'Community and product updates are enabled by default when you join.',
    )
    expect(policy).toContain(
      'The weekly digest is separate and is sent only if you opt in.',
    )
  }
  expect(PRIVACY_MARKDOWN).not.toContain(
    '"community and product updates" in your settings',
  )
})
