import { verifyWebhook } from '@clerk/backend/webhooks'
import { httpRouter } from 'convex/server'

import { internal } from './_generated/api'
import { httpAction } from './_generated/server'
import { parseClerkGithubExternalAccount } from './lib/clerk'
import { getSiteUrl } from './lib/email_provider'
import { getResend } from './lib/resend'

function getPrimaryEmail(data: Record<string, unknown>) {
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

  if (!primaryEmail || typeof primaryEmail !== 'object') {
    return { address: '', verified: false }
  }

  const address =
    'email_address' in primaryEmail &&
    typeof primaryEmail.email_address === 'string'
      ? primaryEmail.email_address
      : ''
  const verification =
    'verification' in primaryEmail &&
    primaryEmail.verification &&
    typeof primaryEmail.verification === 'object'
      ? primaryEmail.verification
      : null
  const verified = Boolean(
    verification &&
    'status' in verification &&
    verification.status === 'verified',
  )

  return { address, verified }
}

function getGithubAccount(data: Record<string, unknown>) {
  const externalAccounts = Array.isArray(data.external_accounts)
    ? data.external_accounts
    : []

  return externalAccounts.find((entry) => {
    if (!entry || typeof entry !== 'object') {
      return false
    }

    return (
      'provider' in entry &&
      (entry.provider === 'oauth_github' || entry.provider === 'github')
    )
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
    const svixEventId = request.headers.get('svix-id')
    let event

    try {
      event = await verifyWebhook(request)
    } catch (error) {
      console.error('Failed to verify Clerk webhook', error)
      return new Response('invalid webhook', { status: 400 })
    }

    const payload = event.data as unknown as Record<string, unknown>
    const eventId =
      (typeof (event as unknown as { id?: unknown }).id === 'string'
        ? (event as unknown as { id: string }).id
        : null) ??
      svixEventId ??
      ''

    if (!eventId) {
      return new Response('missing event id', { status: 400 })
    }

    try {
      const eventState = await ctx.runMutation(
        internal.users.markClerkWebhookEventProcessing,
        {
          eventId,
          eventType: event.type,
        },
      )

      if (!eventState.shouldProcess) {
        return new Response('ok', { status: 200 })
      }

      if (event.type === 'user.created' || event.type === 'user.updated') {
        const primaryEmail = getPrimaryEmail(payload)
        const email = primaryEmail.address
        const githubAccount = getGithubAccount(payload)
        const clerkId = typeof payload.id === 'string' ? payload.id : ''
        const githubParseResult = parseClerkGithubExternalAccount(
          payload.external_accounts,
        )
        if (
          githubParseResult.kind === 'missing_provider_user_id' ||
          githubParseResult.kind === 'invalid_provider_user_id'
        ) {
          console.warn('Clerk GitHub account missing stable provider id', {
            clerkId,
            reason: githubParseResult.kind,
          })
        }
        const githubUsername = getGithubUsername(payload, githubAccount, email)
        const avatarUrl =
          typeof payload.image_url === 'string' ? payload.image_url : ''

        await ctx.runMutation(internal.users.upsertFromClerkWebhook, {
          clerkId,
          email,
          githubId: githubParseResult.githubId,
          githubUsername,
          githubUrl: githubUsername
            ? `https://github.com/${githubUsername}`
            : 'https://github.com',
          displayName: getDisplayName(payload, email),
          avatarUrl,
          emailVerified: primaryEmail.verified,
        })

        await ctx.runMutation(internal.users.markClerkWebhookEventProcessed, {
          eventId,
          status: 'processed',
        })

        return new Response('ok', { status: 200 })
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

        await ctx.runMutation(internal.users.markClerkWebhookEventProcessed, {
          eventId,
          status: 'processed',
        })

        return new Response('ok', { status: 200 })
      }

      await ctx.runMutation(internal.users.markClerkWebhookEventProcessed, {
        eventId,
        status: 'ignored',
      })

      return new Response('ok', { status: 200 })
    } catch (error) {
      await ctx.runMutation(internal.users.markClerkWebhookEventFailed, {
        eventId,
        error: error instanceof Error ? error.message : String(error),
      })
      console.error('Failed to process Clerk webhook', error)
      return new Response('webhook processing failed', { status: 500 })
    }
  }),
})

// Delivery events from Resend, verified and recorded by the email component,
// which then calls emailSends.handleEmailEvent.
http.route({
  path: '/resend-webhook',
  method: 'POST',
  handler: httpAction(async (ctx, request) =>
    getResend().handleResendEventWebhook(ctx, request),
  ),
})

// RFC 8058 one-click unsubscribe. Mail clients POST the body field
// `List-Unsubscribe=One-Click` (URL-encoded or multipart) with no cookies.
async function hasOneClickField(request: Request) {
  try {
    const form = await request.formData()
    return form.get('List-Unsubscribe') === 'One-Click'
  } catch {
    return false
  }
}

http.route({
  path: '/email/unsubscribe',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    const token = new URL(request.url).searchParams.get('t') ?? ''
    if (!token || !(await hasOneClickField(request))) {
      return new Response(null, { status: 400 })
    }
    const ok = await ctx.runMutation(
      internal.emailPreferences.oneClickUnsubscribe,
      { token },
    )
    return new Response(null, { status: ok ? 200 : 400 })
  }),
})

// Link scanners prefetch GETs, so a GET never changes anything: it sends the
// reader to the confirmation page.
http.route({
  path: '/email/unsubscribe',
  method: 'GET',
  handler: httpAction(async (_ctx, request) => {
    const token = new URL(request.url).searchParams.get('t') ?? ''
    return new Response(null, {
      status: 303,
      headers: {
        Location: `${getSiteUrl()}/unsubscribe?t=${encodeURIComponent(token)}`,
      },
    })
  }),
})

export default http
