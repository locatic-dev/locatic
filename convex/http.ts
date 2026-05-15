import { verifyWebhook } from '@clerk/backend/webhooks'
import { httpRouter } from 'convex/server'

import { internal } from './_generated/api'
import { httpAction } from './_generated/server'

function getPrimaryEmailAddress(data: Record<string, unknown>) {
  const emailAddresses = Array.isArray(data.email_addresses)
    ? data.email_addresses
    : []
  const primaryEmailAddressId =
    typeof data.primary_email_address_id === 'string'
      ? data.primary_email_address_id
      : null

  const primaryEmail =
    emailAddresses.find((entry) => {
      if (!entry || typeof entry !== 'object') {
        return false
      }

      return (
        primaryEmailAddressId !== null &&
        'id' in entry &&
        entry.id === primaryEmailAddressId
      )
    }) ?? emailAddresses[0]

  if (
    primaryEmail &&
    typeof primaryEmail === 'object' &&
    'email_address' in primaryEmail &&
    typeof primaryEmail.email_address === 'string'
  ) {
    return primaryEmail.email_address
  }

  return ''
}

function getGithubAccount(data: Record<string, unknown>) {
  const externalAccounts = Array.isArray(data.external_accounts)
    ? data.external_accounts
    : []

  return externalAccounts.find((entry) => {
    if (!entry || typeof entry !== 'object') {
      return false
    }

    return 'provider' in entry && entry.provider === 'oauth_github'
  }) as Record<string, unknown> | undefined
}

function getGithubUsername(
  data: Record<string, unknown>,
  githubAccount: Record<string, unknown> | undefined,
  email: string,
) {
  if (
    githubAccount &&
    'username' in githubAccount &&
    typeof githubAccount.username === 'string' &&
    githubAccount.username.length > 0
  ) {
    return githubAccount.username
  }

  if (typeof data.username === 'string' && data.username.length > 0) {
    return data.username
  }

  return email.split('@')[0] || 'locatic-user'
}

function getDisplayName(data: Record<string, unknown>, email: string) {
  const firstName =
    typeof data.first_name === 'string' ? data.first_name.trim() : ''
  const lastName =
    typeof data.last_name === 'string' ? data.last_name.trim() : ''
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim()

  if (fullName.length > 0) {
    return fullName
  }

  if (typeof data.username === 'string' && data.username.length > 0) {
    return data.username
  }

  return email.split('@')[0] || 'Locatic User'
}

const http = httpRouter()

http.route({
  path: '/clerk/webhooks',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    try {
      const event = await verifyWebhook(request)
      const payload = event.data as unknown as Record<string, unknown>

      if (event.type === 'user.created' || event.type === 'user.updated') {
        const email = getPrimaryEmailAddress(payload)
        const githubAccount = getGithubAccount(payload)
        const clerkId = typeof payload.id === 'string' ? payload.id : ''
        const githubId =
          githubAccount &&
          'provider_user_id' in githubAccount &&
          typeof githubAccount.provider_user_id === 'string' &&
          /^\d+$/.test(githubAccount.provider_user_id)
            ? Number(githubAccount.provider_user_id)
            : null
        const githubUsername = getGithubUsername(payload, githubAccount, email)
        const avatarUrl =
          typeof payload.image_url === 'string' ? payload.image_url : ''

        await ctx.runMutation(internal.users.upsertFromClerkWebhook, {
          clerkId,
          email,
          githubId,
          githubUsername,
          githubUrl: githubUsername
            ? `https://github.com/${githubUsername}`
            : 'https://github.com',
          displayName: getDisplayName(payload, email),
          avatarUrl,
        })
      }

      if (event.type === 'user.deleted') {
        const clerkId =
          typeof payload.id === 'string'
            ? payload.id
            : typeof payload.deleted_object_id === 'string'
              ? payload.deleted_object_id
              : ''

        if (clerkId) {
          await ctx.runMutation(internal.users.deleteFromClerkWebhook, {
            clerkId,
          })
        }
      }

      return new Response('ok', { status: 200 })
    } catch (error) {
      console.error('Failed to verify Clerk webhook', error)
      return new Response('invalid webhook', { status: 400 })
    }
  }),
})

export default http
