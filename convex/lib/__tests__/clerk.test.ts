import { describe, expect, it } from 'vitest'

import {
  parseClerkGithubExternalAccount,
  resolveStoredGithubId,
} from '../clerk'

describe('parseClerkGithubExternalAccount', () => {
  it('accepts snake_case provider user ids from GitHub accounts', () => {
    expect(
      parseClerkGithubExternalAccount([
        {
          provider: 'oauth_github',
          provider_user_id: '74554800',
        },
      ]),
    ).toEqual({ kind: 'valid', githubId: 74554800 })
  })

  it('accepts camelCase provider user ids and github provider names', () => {
    expect(
      parseClerkGithubExternalAccount([
        {
          provider: 'github',
          providerUserId: 74554800,
        },
      ]),
    ).toEqual({ kind: 'valid', githubId: 74554800 })
  })

  it('reports missing GitHub accounts separately from missing ids', () => {
    expect(parseClerkGithubExternalAccount([])).toEqual({
      kind: 'missing_account',
      githubId: null,
    })

    expect(
      parseClerkGithubExternalAccount([{ provider: 'oauth_github' }]),
    ).toEqual({
      kind: 'missing_provider_user_id',
      githubId: null,
    })
  })

  it('rejects invalid provider user ids', () => {
    for (const providerUserId of [
      'not-a-number',
      '0',
      '-1',
      Number.MAX_SAFE_INTEGER + 1,
    ]) {
      expect(
        parseClerkGithubExternalAccount([
          {
            provider: 'oauth_github',
            provider_user_id: providerUserId,
          },
        ]),
      ).toEqual({
        kind: 'invalid_provider_user_id',
        githubId: null,
      })
    }
  })
})

describe('resolveStoredGithubId', () => {
  it('keeps an existing stable id when Clerk omits the incoming provider id', () => {
    expect(resolveStoredGithubId(74554800, null)).toBe(74554800)
  })

  it('uses a valid incoming id when Clerk provides one', () => {
    expect(resolveStoredGithubId(null, 74554800)).toBe(74554800)
    expect(resolveStoredGithubId(1, 74554800)).toBe(74554800)
  })
})
