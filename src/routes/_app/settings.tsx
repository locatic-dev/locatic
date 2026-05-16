import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type { Doc } from '../../../convex/_generated/dataModel'
import { privateProfileQueryOptions } from '@/features/profile/queries'
import {
  citiesSearchQueryOptions,
  popularCitiesQueryOptions,
} from '@/features/cities/queries'
import {
  useDeactivateAccount,
  useDeleteAccount,
  useUpdateNotificationPrefs,
  useUpdatePrivacy,
  useUpdateProfile,
} from '@/features/settings/mutations'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { BrandIcon } from '@/components/ui/brand-icon'
import { CheckCircle2 } from '@/lib/icons'
import {
  BUILD_STATUS,
  StatusPill,
  type BuildStatus,
} from '@/components/ui/status-pill'
import {
  mapPrivateProfile,
  type PrivateProfilePayload,
} from '@/features/contracts'
import { normalizeSocialLinkValue } from '@/lib/social-links'

export const Route = createFileRoute('/_app/settings')({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: ([
      'account',
      'privacy',
      'notifications',
      'connected',
      'danger',
    ].includes(search.tab as string)
      ? search.tab
      : 'account') as
      | 'account'
      | 'privacy'
      | 'notifications'
      | 'connected'
      | 'danger',
  }),
  component: SettingsPage,
})

const TABS = [
  { id: 'account', label: 'account' },
  { id: 'privacy', label: 'privacy' },
  { id: 'notifications', label: 'notifications' },
  { id: 'connected', label: 'connected accounts' },
  { id: 'danger', label: 'danger zone' },
] as const

function SettingsPage() {
  const { tab } = useSearch({ from: '/_app/settings' })
  const navigate = useNavigate()
  const profileQuery = useQuery(privateProfileQueryOptions())
  const profile = mapPrivateProfile(
    profileQuery.data as PrivateProfilePayload | undefined,
  )

  const [citySearch, setCitySearch] = useState('')
  const popularCitiesQuery = useQuery(popularCitiesQueryOptions())
  const citySearchResultsQuery = useQuery({
    ...citiesSearchQueryOptions(citySearch.trim() || 'unused'),
    enabled: citySearch.trim().length > 0,
  })

  const updateProfile = useUpdateProfile()
  const updatePrivacy = useUpdatePrivacy()
  const updateNotifPrefs = useUpdateNotificationPrefs()
  const deactivate = useDeactivateAccount()
  const deleteAccount = useDeleteAccount()

  const [saved, setSaved] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [buildStatus, setBuildStatus] = useState<BuildStatus>('building_solo')
  const [selectedCityId, setSelectedCityId] = useState<string | null>(null)
  const [selectedCityName, setSelectedCityName] = useState<string | null>(null)
  const [twitter, setTwitter] = useState('')
  const [linkedin, setLinkedin] = useState('')
  const [bluesky, setBluesky] = useState('')
  const [website, setWebsite] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!profile) return

    setDisplayName(profile.viewer.displayName)
    setBio(profile.viewer.bio)
    setBuildStatus(profile.viewer.buildStatus)
    setSelectedCityId(
      profile.viewer.cityId ? String(profile.viewer.cityId) : null,
    )
    setSelectedCityName(profile.viewer.cityName)
    setTwitter(profile.viewer.socialLinks.x ?? '')
    setLinkedin(profile.viewer.socialLinks.linkedin ?? '')
    setBluesky(profile.viewer.socialLinks.bluesky ?? '')
    setWebsite(profile.viewer.socialLinks.website ?? '')
  }, [profile])

  if (!profile) {
    return (
      <div style={{ padding: 32, color: 'var(--lx-text-3)' }}>loading…</div>
    )
  }

  const cityResults =
    citySearch.trim().length > 0
      ? ((citySearchResultsQuery.data as Array<Doc<'cities'>> | undefined) ??
        [])
      : ((popularCitiesQuery.data as Array<Doc<'cities'>> | undefined) ?? [])

  const handleSaveAccount = async () => {
    setSaving(true)

    try {
      await updateProfile({
        displayName: displayName.trim(),
        bio: bio.trim(),
        cityId: (selectedCityId as never) ?? null,
        buildStatus,
        socialLinks: {
          github: profile.viewer.githubUsername,
          x: normalizeSocialLinkValue('x', twitter),
          linkedin: normalizeSocialLinkValue('linkedin', linkedin),
          bluesky: normalizeSocialLinkValue('bluesky', bluesky),
          website: normalizeSocialLinkValue('website', website),
        },
      })
      setSaved(true)
      window.setTimeout(() => setSaved(false), 2000)
    } catch (error) {
      console.error(error)
    } finally {
      setSaving(false)
    }
  }

  const fieldStyle = {
    background: 'var(--lx-bg)',
    borderColor: 'var(--lx-border)',
    color: 'var(--lx-text)',
    fontFamily: 'var(--lx-font-sans)',
  }
  const labelStyle = {
    fontFamily: 'var(--lx-font-mono)',
    fontSize: 11.5,
    color: 'var(--lx-text-2)',
    display: 'block',
    marginBottom: 6,
  } as const
  const sectionTitle = {
    fontFamily: 'var(--lx-font-mono)',
    fontSize: 10.5,
    fontWeight: 600,
    color: 'var(--lx-text-3)',
    marginBottom: 16,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
  } as const

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          height: 56,
          padding: '0 32px',
          display: 'flex',
          alignItems: 'center',
          borderBottom: '1px solid var(--lx-border)',
          flexShrink: 0,
        }}
      >
        <h1
          style={{
            margin: 0,
            fontFamily: 'var(--lx-font-mono)',
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--lx-text)',
          }}
        >
          settings
        </h1>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <nav
          style={{
            width: 220,
            borderRight: '1px solid var(--lx-border)',
            padding: '16px 0',
            flexShrink: 0,
          }}
        >
          {TABS.map((tabItem) => (
            <button
              key={tabItem.id}
              onClick={() =>
                void navigate({
                  to: '/settings',
                  search: { tab: tabItem.id } as never,
                } as never)
              }
              style={{
                width: '100%',
                padding: '8px 20px',
                background:
                  tab === tabItem.id ? 'var(--lx-surface-alt)' : 'transparent',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                fontFamily: 'var(--lx-font-mono)',
                fontSize: 12.5,
                color:
                  tab === tabItem.id ? 'var(--lx-text)' : 'var(--lx-text-2)',
                fontWeight: tab === tabItem.id ? 600 : 400,
              }}
              type="button"
            >
              {tabItem.label}
            </button>
          ))}
        </nav>

        <div style={{ flex: 1, overflowY: 'auto', padding: '28px 40px 80px' }}>
          {tab === 'account' && (
            <div
              style={{
                maxWidth: 640,
                display: 'flex',
                flexDirection: 'column',
                gap: 28,
              }}
            >
              <div>
                <div style={sectionTitle}>profile</div>
                <div
                  style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
                >
                  <div>
                    <label style={labelStyle}>display name</label>
                    <Input
                      value={displayName}
                      onChange={(event) => setDisplayName(event.target.value)}
                      style={fieldStyle}
                      placeholder="your display name"
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>
                      bio{' '}
                      <span style={{ color: 'var(--lx-text-3)' }}>
                        ({bio.length}/140)
                      </span>
                    </label>
                    <Textarea
                      value={bio}
                      onChange={(event) =>
                        setBio(event.target.value.slice(0, 140))
                      }
                      style={{ ...fieldStyle, resize: 'none' }}
                      rows={3}
                      placeholder="what are you building?"
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>build status</label>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                        gap: 10,
                      }}
                    >
                      {(
                        Object.entries(BUILD_STATUS) as Array<
                          [BuildStatus, (typeof BUILD_STATUS)[BuildStatus]]
                        >
                      ).map(([statusId]) => {
                        const selected = buildStatus === statusId

                        return (
                          <button
                            key={statusId}
                            onClick={() => setBuildStatus(statusId)}
                            style={{
                              border: '1px solid var(--lx-border)',
                              borderColor: selected
                                ? 'var(--lx-accent)'
                                : 'var(--lx-border)',
                              background: selected
                                ? 'var(--lx-accent-quiet)'
                                : 'var(--lx-surface)',
                              borderRadius: 4,
                              padding: '12px 14px',
                              textAlign: 'left',
                              cursor: 'pointer',
                            }}
                            type="button"
                          >
                            <StatusPill status={statusId} size="md" />
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <div>
                    <label style={labelStyle}>city</label>
                    <Input
                      value={citySearch}
                      onChange={(event) => setCitySearch(event.target.value)}
                      style={fieldStyle}
                      placeholder={selectedCityName ?? 'search for your city'}
                    />
                    {selectedCityName && (
                      <div
                        style={{
                          marginTop: 8,
                          fontFamily: 'var(--lx-font-mono)',
                          fontSize: 11,
                          color: 'var(--lx-text-3)',
                        }}
                      >
                        selected: {selectedCityName}
                      </div>
                    )}
                    {(citySearch.trim() ? cityResults : cityResults.slice(0, 6))
                      .slice(0, 6)
                      .map((city) => (
                        <button
                          key={String(city._id)}
                          onClick={() => {
                            setSelectedCityId(String(city._id))
                            setSelectedCityName(city.displayName)
                            setCitySearch('')
                          }}
                          style={{
                            width: '100%',
                            marginTop: 8,
                            border: '1px dashed var(--lx-border)',
                            background: 'transparent',
                            borderRadius: 4,
                            padding: '8px 10px',
                            textAlign: 'left',
                            fontFamily: 'var(--lx-font-mono)',
                            fontSize: 11.5,
                            color: 'var(--lx-text-2)',
                            cursor: 'pointer',
                          }}
                          type="button"
                        >
                          {city.displayName}
                        </button>
                      ))}
                  </div>
                </div>
              </div>

              <div>
                <div style={sectionTitle}>social links</div>
                <div
                  style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
                >
                  <div>
                    <label style={labelStyle}>x</label>
                    <Input
                      value={twitter}
                      onChange={(event) => setTwitter(event.target.value)}
                      style={fieldStyle}
                      placeholder="@username"
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>linkedin</label>
                    <Input
                      value={linkedin}
                      onChange={(event) => setLinkedin(event.target.value)}
                      style={fieldStyle}
                      placeholder="linkedin.com/in/username"
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>bluesky</label>
                    <Input
                      value={bluesky}
                      onChange={(event) => setBluesky(event.target.value)}
                      style={fieldStyle}
                      placeholder="@username.bsky.social"
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>website</label>
                    <Input
                      value={website}
                      onChange={(event) => setWebsite(event.target.value)}
                      style={fieldStyle}
                      placeholder="https://yoursite.dev"
                    />
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Button
                  onClick={() => void handleSaveAccount()}
                  disabled={saving || !displayName.trim()}
                  style={{
                    background: 'var(--lx-accent)',
                    color: '#0d1117',
                    border: 'none',
                    fontFamily: 'var(--lx-font-mono)',
                    fontSize: 12.5,
                    fontWeight: 600,
                  }}
                >
                  {saving ? 'saving…' : 'save changes'}
                </Button>
                {saved && (
                  <span
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      fontFamily: 'var(--lx-font-mono)',
                      fontSize: 12,
                      color: 'var(--lx-success)',
                    }}
                  >
                    <CheckCircle2 size={14} /> saved
                  </span>
                )}
              </div>
            </div>
          )}

          {tab === 'privacy' && (
            <div
              style={{
                maxWidth: 560,
                display: 'flex',
                flexDirection: 'column',
                gap: 28,
              }}
            >
              <div>
                <div style={sectionTitle}>visibility</div>
                {[
                  {
                    key: 'commentHistoryVisibility',
                    label: 'comment history',
                    desc: 'who can see your comment history tab on your profile',
                    type: 'tab',
                  },
                  {
                    key: 'likedProjectsVisibility',
                    label: 'liked projects',
                    desc: 'who can see your liked tab on your profile',
                    type: 'tab',
                  },
                  {
                    key: 'followGraphVisibility',
                    label: 'follow graph',
                    desc: 'who can see your followers and following counts',
                    type: 'tab',
                  },
                  {
                    key: 'appearInPulse',
                    label: 'appear in pulse rankings',
                    desc: 'allow your projects to appear in trending charts',
                    type: 'boolean',
                  },
                ].map(({ key, label, desc, type }) => (
                  <div
                    key={key}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '14px 0',
                      borderBottom: '1px solid var(--lx-border)',
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontFamily: 'var(--lx-font-mono)',
                          fontSize: 13,
                          color: 'var(--lx-text)',
                          marginBottom: 3,
                        }}
                      >
                        {label}
                      </div>
                      <div
                        style={{
                          fontFamily: 'var(--lx-font-sans)',
                          fontSize: 12,
                          color: 'var(--lx-text-3)',
                        }}
                      >
                        {desc}
                      </div>
                    </div>
                    <Switch
                      checked={
                        type === 'boolean'
                          ? profile.viewer.privacy[key as 'appearInPulse']
                          : profile.viewer.privacy[
                              key as
                                | 'commentHistoryVisibility'
                                | 'likedProjectsVisibility'
                                | 'followGraphVisibility'
                            ] === 'public'
                      }
                      onCheckedChange={async (checked) => {
                        const nextPrivacy = {
                          ...profile.viewer.privacy,
                          [key]:
                            type === 'boolean'
                              ? checked
                              : checked
                                ? 'public'
                                : 'private',
                        }
                        try {
                          await updatePrivacy(nextPrivacy)
                        } catch (error) {
                          console.error(error)
                        }
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'notifications' && (
            <div style={{ maxWidth: 560 }}>
              <div style={sectionTitle}>notification preferences</div>
              {[
                { key: 'projectLikes', label: 'likes on your projects' },
                { key: 'updateLikes', label: 'likes on your updates' },
                { key: 'comments', label: 'comments on your projects' },
                { key: 'commentReplies', label: 'replies to your comments' },
                { key: 'newFollowers', label: 'new followers' },
                { key: 'dms', label: 'direct messages' },
                { key: 'weeklyDigest', label: 'weekly digest email' },
                {
                  key: 'contributorRecognized',
                  label: 'contributor recognition',
                },
              ].map(({ key, label }) => (
                <div
                  key={key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '14px 0',
                    borderBottom: '1px solid var(--lx-border)',
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'var(--lx-font-mono)',
                      fontSize: 13,
                      color: 'var(--lx-text)',
                    }}
                  >
                    {label}
                  </span>
                  <Switch
                    checked={
                      profile.viewer.notificationPrefs[
                        key as keyof typeof profile.viewer.notificationPrefs
                      ]
                    }
                    onCheckedChange={async (checked) => {
                      const nextPrefs = {
                        ...profile.viewer.notificationPrefs,
                        [key]: checked,
                      }
                      try {
                        await updateNotifPrefs(nextPrefs)
                      } catch (error) {
                        console.error(error)
                      }
                    }}
                  />
                </div>
              ))}
            </div>
          )}

          {tab === 'connected' && (
            <div
              style={{
                maxWidth: 560,
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
              }}
            >
              <div style={sectionTitle}>connected accounts</div>
              <div
                style={{
                  padding: '16px 18px',
                  borderRadius: 6,
                  border: '1px solid var(--lx-border)',
                  background: 'var(--lx-surface)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <BrandIcon name="github" size={18} />
                  <div>
                    <div
                      style={{
                        fontFamily: 'var(--lx-font-mono)',
                        fontSize: 13,
                        color: 'var(--lx-text)',
                        fontWeight: 600,
                      }}
                    >
                      GitHub
                    </div>
                    <div
                      style={{
                        fontFamily: 'var(--lx-font-mono)',
                        fontSize: 11,
                        color: 'var(--lx-text-3)',
                      }}
                    >
                      @{profile.viewer.githubUsername}
                    </div>
                  </div>
                </div>
                <span
                  style={{
                    fontFamily: 'var(--lx-font-mono)',
                    fontSize: 11,
                    color: 'var(--lx-success)',
                  }}
                >
                  connected
                </span>
              </div>
            </div>
          )}

          {tab === 'danger' && (
            <div
              style={{
                maxWidth: 560,
                display: 'flex',
                flexDirection: 'column',
                gap: 20,
              }}
            >
              <div
                style={{
                  padding: '20px',
                  border: '1px solid var(--lx-border)',
                  borderRadius: 6,
                  background: 'var(--lx-surface)',
                }}
              >
                <div
                  style={{
                    fontFamily: 'var(--lx-font-mono)',
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'var(--lx-text)',
                    marginBottom: 8,
                  }}
                >
                  deactivate account
                </div>
                <p
                  style={{
                    margin: '0 0 14px',
                    fontFamily: 'var(--lx-font-sans)',
                    fontSize: 13,
                    color: 'var(--lx-text-2)',
                    lineHeight: 1.5,
                  }}
                >
                  hides your profile from Explore and public surfaces until you
                  reactivate.
                </p>
                <Button
                  variant="outline"
                  onClick={async () => {
                    if (
                      window.confirm(
                        'Deactivate your account? Your profile will be hidden.',
                      )
                    ) {
                      try {
                        await deactivate({})
                      } catch (error) {
                        console.error(error)
                      }
                    }
                  }}
                  style={{
                    fontFamily: 'var(--lx-font-mono)',
                    fontSize: 12.5,
                    borderColor: 'var(--lx-border-strong)',
                    color: 'var(--lx-text-2)',
                  }}
                >
                  deactivate account
                </Button>
              </div>

              <div
                style={{
                  padding: '20px',
                  border: '1px solid oklch(62% 0.22 25 / 0.4)',
                  borderRadius: 6,
                  background: 'oklch(62% 0.22 25 / 0.04)',
                }}
              >
                <div
                  style={{
                    fontFamily: 'var(--lx-font-mono)',
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'var(--lx-danger)',
                    marginBottom: 8,
                  }}
                >
                  delete account
                </div>
                <p
                  style={{
                    margin: '0 0 14px',
                    fontFamily: 'var(--lx-font-sans)',
                    fontSize: 13,
                    color: 'var(--lx-text-2)',
                    lineHeight: 1.5,
                  }}
                >
                  permanently removes all your Locatic data and unstars all
                  repos starred via Locatic. this cannot be undone.
                </p>
                <Button
                  onClick={async () => {
                    const confirmed = window.prompt(
                      'Type DELETE to confirm permanent account deletion:',
                    )
                    if (confirmed === 'DELETE') {
                      try {
                        await deleteAccount({})
                      } catch (error) {
                        console.error(error)
                      }
                    }
                  }}
                  style={{
                    background: 'var(--lx-danger)',
                    color: 'oklch(93% 0.005 230)',
                    border: 'none',
                    fontFamily: 'var(--lx-font-mono)',
                    fontSize: 12.5,
                    fontWeight: 600,
                  }}
                >
                  delete account permanently
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
