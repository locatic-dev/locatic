import { ConvexError } from 'convex/values'

import type { MutationCtx, QueryCtx } from '../_generated/server'
import { UNSUBSCRIBE_URL_PLACEHOLDER } from './emails/placeholders'
import {
  isCommentPubliclyInteractable,
  isProjectPubliclyInteractable,
} from './project_access'
import type { Doc } from './types'

export const EMAIL_TEMPLATE_VERSION = 2

// Mirrored in src/features/email-campaigns/contracts.ts (a test keeps them in
// step). The rendered-HTML cap stays under Gmail's ~102 KB clipping point,
// which would otherwise hide the unsubscribe footer. `emailBytes` caps what
// one recipient's email costs to store (see `emailBytes()`): the component
// reads the content of up to 100 emails in one query, so 100 of them must
// stay well under Convex's 16 MiB per-transaction limit (12 MB here).
export const LIMITS = {
  subject: 140,
  preheader: 200,
  body: 20_000,
  ctaLabel: 40,
  url: 2_000,
  renderedHtmlBytes: 100_000,
  emailBytes: 120_000,
  // The send dialog's estimate reads at most this many members.
  sendPreviewMembers: 100,
  projects: 5,
  discussions: 2,
} as const

/** Room for one personal unsubscribe URL replacing each placeholder. */
export const UNSUBSCRIBE_URL_HEADROOM_BYTES = 512
/** The component email, its List-Unsubscribe headers, and the send row. */
export const EMAIL_METADATA_HEADROOM_BYTES = 4_096
/**
 * What one enqueue batch may write for its emails: half of Convex's 16 MiB
 * per-transaction write limit, leaving room for the campaign update and the
 * component's own bookkeeping.
 */
export const ENQUEUE_BATCH_BYTES = 8 * 1024 * 1024
const MAX_ENQUEUE_PAGE = 100

const utf8 = new TextEncoder()

function countOccurrences(value: string, search: string) {
  return value.split(search).length - 1
}

/**
 * Bytes one recipient's email costs to write: the HTML and text (each stored
 * per recipient), headroom for every unsubscribe placeholder to become a
 * personal URL, and the per-recipient documents.
 */
export function emailBytes(html: string, text: string) {
  const placeholders =
    countOccurrences(html, UNSUBSCRIBE_URL_PLACEHOLDER) +
    countOccurrences(text, UNSUBSCRIBE_URL_PLACEHOLDER)
  return (
    utf8.encode(html).length +
    utf8.encode(text).length +
    placeholders * UNSUBSCRIBE_URL_HEADROOM_BYTES +
    EMAIL_METADATA_HEADROOM_BYTES
  )
}

/** Recipients per enqueue batch, so a batch writes at most ENQUEUE_BATCH_BYTES. */
export function enqueuePageSize(
  html: string,
  text: string,
  requested: number = MAX_ENQUEUE_PAGE,
) {
  const bySize = Math.floor(ENQUEUE_BATCH_BYTES / emailBytes(html, text))
  return Math.max(1, Math.min(requested, MAX_ENQUEUE_PAGE, bySize))
}

export type EmailCampaignContent = Doc<'email_campaigns'>['content']
export type DigestContent = Extract<EmailCampaignContent, { kind: 'digest' }>

type Draft = Pick<Doc<'email_campaigns'>, 'subject' | 'preheader' | 'content'>
type DbCtx = Pick<QueryCtx | MutationCtx, 'db'>

function tooLong(value: string, label: string, max: number) {
  if (value.length > max) throw new ConvexError(`${label} is too long`)
}

export function assertSafeEmailUrl(value: string) {
  tooLong(value, 'Link', LIMITS.url)
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new ConvexError('Links must be valid URLs')
  }
  if (url.protocol !== 'https:') throw new ConvexError('Links must use HTTPS')
}

export function assertCampaignDraft(draft: Draft) {
  tooLong(draft.subject, 'Subject', LIMITS.subject)
  tooLong(draft.preheader, 'Preheader', LIMITS.preheader)
  tooLong(draft.content.body, 'Body', LIMITS.body)
  if (draft.content.cta) {
    tooLong(draft.content.cta.label, 'Button label', LIMITS.ctaLabel)
    assertSafeEmailUrl(draft.content.cta.url)
  }
  if (draft.content.kind === 'digest') {
    if (draft.content.projects.length > LIMITS.projects) {
      throw new ConvexError(`Select at most ${LIMITS.projects} projects`)
    }
    if (draft.content.discussions.length > LIMITS.discussions) {
      throw new ConvexError(`Select at most ${LIMITS.discussions} discussions`)
    }
    for (const project of draft.content.projects) {
      assertSafeEmailUrl(project.url)
    }
    for (const discussion of draft.content.discussions) {
      assertSafeEmailUrl(discussion.url)
    }
  }
}

export function assertSendableCampaign(draft: Draft) {
  assertCampaignDraft(draft)
  if (!draft.subject.trim()) throw new ConvexError('Subject is required')
  if (!draft.content.body.trim()) throw new ConvexError('Body is required')
  if (draft.content.cta && !draft.content.cta.label.trim()) {
    throw new ConvexError('Button label is required')
  }
}

export function assertRenderedSize(html: string) {
  if (utf8.encode(html).length > LIMITS.renderedHtmlBytes) {
    throw new ConvexError('Email is too large; shorten the body')
  }
}

/** Both caps: Gmail clipping (HTML) and the per-recipient storage budget. */
export function assertEmailSize(html: string, text: string) {
  assertRenderedSize(html)
  if (emailBytes(html, text) > LIMITS.emailBytes) {
    throw new ConvexError(
      'Email is too large to send; shorten the body or use fewer long links',
    )
  }
}

/**
 * A digest may only point at projects and discussions that are still public.
 * Announcements carry no selections.
 */
export async function assertDigestSelectionsPublic(
  ctx: DbCtx,
  content: EmailCampaignContent,
) {
  if (content.kind !== 'digest') return
  for (const selected of content.projects) {
    const project = await ctx.db.get(selected.projectId)
    if (
      !project ||
      !project.exploreOwner.isEligible ||
      !(await isProjectPubliclyInteractable(ctx, project))
    ) {
      throw new ConvexError(
        `Selected project ${selected.fullName} is no longer public`,
      )
    }
  }
  for (const selected of content.discussions) {
    const comment = await ctx.db.get(selected.commentId)
    if (!(await isCommentPubliclyInteractable(ctx, comment))) {
      throw new ConvexError(
        `Selected discussion ${selected.title} is no longer public`,
      )
    }
  }
}
