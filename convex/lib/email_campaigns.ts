import { ConvexError } from 'convex/values'

import type { Doc } from './types'

export const EMAIL_TEMPLATE_VERSION = 1
export const MAX_EMAIL_SUBJECT_LENGTH = 140
export const MAX_EMAIL_PREHEADER_LENGTH = 200
export const MAX_EMAIL_INTRODUCTION_LENGTH = 4_000
export const MAX_EMAIL_SHIPPING_LENGTH = 4_000
export const MAX_EMAIL_PROJECTS = 5
export const MAX_EMAIL_DISCUSSIONS = 2

export type EmailCampaignContent = Doc<'email_campaigns'>['content']

function assertLength(value: string, label: string, maxLength: number) {
  if (value.trim().length === 0) {
    throw new ConvexError(`${label} is required`)
  }
  if (value.length > maxLength) {
    throw new ConvexError(`${label} is too long`)
  }
}

function assertOptionalLength(value: string, label: string, maxLength: number) {
  if (value.length > maxLength) {
    throw new ConvexError(`${label} is too long`)
  }
}

export function assertSafeEmailUrl(value: string) {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new ConvexError('Email links must be valid URLs')
  }

  if (url.protocol !== 'https:') {
    throw new ConvexError('Email links must use HTTPS')
  }
}

export function assertCampaignContentBounds(content: EmailCampaignContent) {
  assertOptionalLength(content.subject, 'Subject', MAX_EMAIL_SUBJECT_LENGTH)
  assertOptionalLength(
    content.preheader,
    'Preheader',
    MAX_EMAIL_PREHEADER_LENGTH,
  )
  assertOptionalLength(
    content.introduction,
    'Introduction',
    MAX_EMAIL_INTRODUCTION_LENGTH,
  )
  assertOptionalLength(
    content.shippingUpdate,
    'Shipping update',
    MAX_EMAIL_SHIPPING_LENGTH,
  )

  if (content.projects.length > MAX_EMAIL_PROJECTS) {
    throw new ConvexError(`Select at most ${MAX_EMAIL_PROJECTS} projects`)
  }
  if (content.discussions.length > MAX_EMAIL_DISCUSSIONS) {
    throw new ConvexError(`Select at most ${MAX_EMAIL_DISCUSSIONS} discussions`)
  }

  for (const project of content.projects) {
    assertLength(project.name, 'Project name', 160)
    assertLength(project.fullName, 'Project full name', 240)
    assertOptionalLength(project.description ?? '', 'Project description', 500)
    assertLength(project.activityLabel, 'Project activity label', 160)
    assertSafeEmailUrl(project.url)
  }

  for (const discussion of content.discussions) {
    assertLength(discussion.title, 'Discussion title', 200)
    assertLength(discussion.summary, 'Discussion summary', 500)
    assertSafeEmailUrl(discussion.url)
  }
}

export function assertReviewableCampaignContent(content: EmailCampaignContent) {
  assertCampaignContentBounds(content)
  assertLength(content.subject, 'Subject', MAX_EMAIL_SUBJECT_LENGTH)
  assertLength(
    content.introduction,
    'Introduction',
    MAX_EMAIL_INTRODUCTION_LENGTH,
  )
}

export function campaignContentFingerprint(content: EmailCampaignContent) {
  const input = JSON.stringify(content)
  let hash = 0x811c9dc5
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function emptyCampaignContent(): EmailCampaignContent {
  return {
    subject: '',
    preheader: '',
    introduction: '',
    projects: [],
    discussions: [],
    shippingUpdate: '',
  }
}
