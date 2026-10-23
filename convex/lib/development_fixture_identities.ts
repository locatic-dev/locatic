import { ConvexError } from 'convex/values'
import { parseClerkGithubExternalAccount } from './clerk'
import type { FixtureIdentities } from './development_fixture_contracts'

export type FixtureClerkIds = {
  populated: string
  empty: string
  onboarding: string
}
function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {}
}
function records(value: unknown) {
  return Array.isArray(value) ? value.map(record) : []
}

/** SDK resources are mapped here, never token claims or caller-supplied identity details. */
export function resolveDevelopmentFixtureIdentities(
  ids: FixtureClerkIds,
  users: unknown[],
): FixtureIdentities {
  const result = {} as FixtureIdentities
  for (const [index, role] of (
    ['populated', 'empty', 'onboarding'] as const
  ).entries()) {
    const user = record(users[index])
    if (user.id !== ids[role])
      throw new ConvexError('Clerk returned a different fixture user')
    const primary = records(user.emailAddresses).find(
      (email) => email.id === user.primaryEmailAddressId,
    )
    const github = records(user.externalAccounts).find(
      (account) =>
        account.provider === 'oauth_github' || account.provider === 'github',
    )
    const parsed = parseClerkGithubExternalAccount(user.externalAccounts)
    if (
      !primary ||
      record(primary.verification).status !== 'verified' ||
      typeof primary.emailAddress !== 'string' ||
      !github ||
      typeof github.username !== 'string' ||
      parsed.kind !== 'valid'
    ) {
      throw new ConvexError(
        'Fixture personas need a verified primary email and connected GitHub provider identity',
      )
    }
    result[role] = {
      clerkId: ids[role],
      email: primary.emailAddress,
      githubId: parsed.githubId,
      githubUsername: github.username,
      displayName:
        typeof user.fullName === 'string' && user.fullName
          ? user.fullName
          : github.username,
      avatarUrl: typeof user.imageUrl === 'string' ? user.imageUrl : '',
    }
  }
  return result
}
