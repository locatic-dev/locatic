import type { BuildStatus } from '@/components/ui/status-pill'
import { normalizeSocialLinkValue } from '@/lib/social-links'

/** The editable account-form fields, normalized for a stable dirty comparison. */
export type SettingsAccountFormState = {
  displayName: string
  bio: string
  buildStatus: BuildStatus
  cityId: string | null
  twitter: string | null
  linkedin: string | null
  bluesky: string | null
  website: string | null
}

type SettingsAccountViewerSnapshot = {
  displayName: string
  bio: string
  buildStatus: BuildStatus
  cityId: string | null
  socialLinks: {
    x?: string | null
    linkedin?: string | null
    bluesky?: string | null
    website?: string | null
  }
}

export type SettingsAccountFormInput = {
  displayName: string
  bio: string
  buildStatus: BuildStatus
  cityId: string | null
  twitter: string
  linkedin: string
  bluesky: string
  website: string
}

export function getSettingsAccountStateFromViewer(
  viewer: SettingsAccountViewerSnapshot,
): SettingsAccountFormState {
  return {
    displayName: viewer.displayName,
    bio: viewer.bio,
    buildStatus: viewer.buildStatus,
    cityId: viewer.cityId ? String(viewer.cityId) : null,
    twitter: viewer.socialLinks.x ?? null,
    linkedin: viewer.socialLinks.linkedin ?? null,
    bluesky: viewer.socialLinks.bluesky ?? null,
    website: viewer.socialLinks.website ?? null,
  }
}

export function getSettingsAccountStateFromForm(
  form: SettingsAccountFormInput,
): SettingsAccountFormState {
  return {
    displayName: form.displayName.trim(),
    bio: form.bio.trim(),
    buildStatus: form.buildStatus,
    cityId: form.cityId ? String(form.cityId) : null,
    twitter: normalizeSocialLinkValue('x', form.twitter),
    linkedin: normalizeSocialLinkValue('linkedin', form.linkedin),
    bluesky: normalizeSocialLinkValue('bluesky', form.bluesky),
    website: normalizeSocialLinkValue('website', form.website),
  }
}

/**
 * Pure dirty check for the account settings form: true when any field differs
 * from the persisted snapshot. Kept side-effect free so it is trivially testable
 * and so the sticky save bar / unsaved-changes guard share one source of truth.
 */
export function getSettingsDirty(
  initial: SettingsAccountFormState,
  current: SettingsAccountFormState,
): boolean {
  return (
    initial.displayName !== current.displayName ||
    initial.bio !== current.bio ||
    initial.buildStatus !== current.buildStatus ||
    initial.cityId !== current.cityId ||
    initial.twitter !== current.twitter ||
    initial.linkedin !== current.linkedin ||
    initial.bluesky !== current.bluesky ||
    initial.website !== current.website
  )
}
