import { describe, expect, it } from 'vitest'

import {
  getSettingsAccountStateFromForm,
  getSettingsDirty,
  getSettingsUrlErrors,
  type SettingsAccountFormState,
} from '../dirty'

const base: SettingsAccountFormState = {
  displayName: 'Avinash Changrani',
  bio: 'Building what others can imagine',
  buildStatus: 'open_to_collab',
  cityId: 'city_blr',
  twitter: 'avi',
  linkedin: null,
  bluesky: null,
  website: null,
}

describe('getSettingsDirty', () => {
  it('is clean when every field matches the snapshot', () => {
    expect(getSettingsDirty(base, { ...base })).toBe(false)
  })

  it.each([
    ['displayName', { displayName: 'Avi' }],
    ['bio', { bio: 'changed' }],
    ['buildStatus', { buildStatus: 'building_solo' as const }],
    ['cityId', { cityId: 'city_hyd' }],
    ['cityId cleared to null', { cityId: null }],
    ['twitter', { twitter: '@new' }],
    ['linkedin', { linkedin: 'linkedin.com/in/avi' }],
    ['bluesky', { bluesky: '@avi.bsky.social' }],
    ['website', { website: 'https://avi.dev' }],
  ])('is dirty when %s changes', (_label, patch) => {
    expect(getSettingsDirty(base, { ...base, ...patch })).toBe(true)
  })

  it('treats equivalent normalized social-link inputs as clean', () => {
    const current = getSettingsAccountStateFromForm({
      displayName: 'Avinash Changrani',
      bio: 'Building what others can imagine',
      buildStatus: 'open_to_collab',
      cityId: 'city_blr',
      twitter: '@avi',
      linkedin: '',
      bluesky: '',
      website: '',
    })

    expect(getSettingsDirty(base, current)).toBe(false)
  })

  it('treats bare urls and persisted https urls as equivalent', () => {
    const persisted: SettingsAccountFormState = {
      ...base,
      linkedin: 'https://linkedin.com/in/avi',
      website: 'https://avi.dev/',
    }
    const current = getSettingsAccountStateFromForm({
      displayName: base.displayName,
      bio: base.bio,
      buildStatus: base.buildStatus,
      cityId: base.cityId,
      twitter: '@avi',
      linkedin: 'linkedin.com/in/avi',
      bluesky: '',
      website: 'avi.dev',
    })

    expect(getSettingsDirty(persisted, current)).toBe(false)
  })

  it('treats blank social fields and persisted null values as equivalent', () => {
    const current = getSettingsAccountStateFromForm({
      displayName: base.displayName,
      bio: base.bio,
      buildStatus: base.buildStatus,
      cityId: base.cityId,
      twitter: '@avi',
      linkedin: '  ',
      bluesky: '',
      website: '',
    })

    expect(getSettingsDirty(base, current)).toBe(false)
  })
})

describe('settings URL validation', () => {
  it('allows blank and bare HTTPS links but distinguishes malformed values from empty input', () => {
    expect(getSettingsUrlErrors({ website: '', linkedin: '  ' })).toEqual({
      website: null,
      linkedin: null,
    })
    expect(
      getSettingsUrlErrors({
        website: 'example.com',
        linkedin: 'linkedin.com/in/demo',
      }),
    ).toEqual({ website: null, linkedin: null })
    const errors = getSettingsUrlErrors({
      website: 'not a valid website',
      linkedin: 'not a valid profile',
    })
    expect(errors.website).toMatch(/valid.*URL/)
    expect(errors.linkedin).toMatch(/valid.*URL/)
  })
})
