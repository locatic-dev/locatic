export type ClerkGithubExternalAccountParseResult =
  | {
      kind: 'missing_account'
      githubId: null
    }
  | {
      kind: 'missing_provider_user_id'
      githubId: null
    }
  | {
      kind: 'invalid_provider_user_id'
      githubId: null
    }
  | {
      kind: 'valid'
      githubId: number
    }

function getProviderUserId(account: Record<string, unknown>) {
  return account.provider_user_id ?? account.providerUserId ?? null
}

function parsePositiveSafeInteger(value: unknown) {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 ? value : null
  }

  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    return null
  }

  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

export function parseClerkGithubExternalAccount(
  externalAccounts: unknown,
): ClerkGithubExternalAccountParseResult {
  if (!Array.isArray(externalAccounts)) {
    return { kind: 'missing_account', githubId: null }
  }

  const githubAccount = externalAccounts.find((entry) => {
    if (!entry || typeof entry !== 'object') {
      return false
    }

    const provider = (entry as Record<string, unknown>).provider
    return provider === 'oauth_github' || provider === 'github'
  }) as Record<string, unknown> | undefined

  if (!githubAccount) {
    return { kind: 'missing_account', githubId: null }
  }

  const providerUserId = getProviderUserId(githubAccount)
  if (providerUserId === null || providerUserId === undefined) {
    return { kind: 'missing_provider_user_id', githubId: null }
  }

  const githubId = parsePositiveSafeInteger(providerUserId)
  if (githubId === null) {
    return { kind: 'invalid_provider_user_id', githubId: null }
  }

  return { kind: 'valid', githubId }
}

export function resolveStoredGithubId(
  existingGithubId: number | null | undefined,
  incomingGithubId: number | null,
) {
  return incomingGithubId ?? existingGithubId ?? null
}
