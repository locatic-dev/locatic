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

const fieldClassName = 'border-line bg-canvas font-sans text-text'
const labelClassName = 'mb-1.5 block font-mono text-[11.5px] text-text-muted'
const sectionTitleClassName =
  'mb-4 font-mono text-[10.5px] font-semibold uppercase tracking-[0.06em] text-text-faint'
const settingsRowClassName =
  'flex items-center justify-between gap-4 border-b border-line py-3.5'

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
    return <div className="p-8 text-text-faint">loading…</div>
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

  return (
    <div className="lx-page-shell">
      <div className="shrink-0 border-b border-line px-[var(--lx-gutter)] pt-5">
        <h1 className="mb-4 font-mono text-sm font-semibold text-text">
          settings
        </h1>
        <nav className="flex gap-1 overflow-x-auto">
          {TABS.map((tabItem) => (
            <button
              key={tabItem.id}
              onClick={() =>
                void navigate({
                  to: '/settings',
                  search: { tab: tabItem.id } as never,
                } as never)
              }
              className={`mb-[-1px] whitespace-nowrap border-b-2 px-1 pb-2.5 font-mono text-[12px] transition-colors ${
                tab === tabItem.id
                  ? 'border-text font-semibold text-text'
                  : 'border-transparent text-text-muted hover:text-text'
              }`}
              type="button"
            >
              {tabItem.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="lx-page-scroll flex-1">
          <div className="lx-page-width-form">
            {tab === 'account' && (
              <div className="flex flex-col gap-7">
                <div>
                  <div className={sectionTitleClassName}>profile</div>
                  <div className="flex flex-col gap-4">
                    <div>
                      <label className={labelClassName}>display name</label>
                      <Input
                        value={displayName}
                        onChange={(event) => setDisplayName(event.target.value)}
                        className={fieldClassName}
                        placeholder="your display name"
                      />
                    </div>

                    <div>
                      <label className={labelClassName}>
                        bio{' '}
                        <span className="text-text-faint">
                          ({bio.length}/140)
                        </span>
                      </label>
                      <Textarea
                        value={bio}
                        onChange={(event) =>
                          setBio(event.target.value.slice(0, 140))
                        }
                        className={`${fieldClassName} resize-none`}
                        rows={3}
                        placeholder="what are you building?"
                      />
                    </div>

                    <div>
                      <label className={labelClassName}>build status</label>
                      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
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
                              className={`rounded border px-3.5 py-3 text-left ${
                                selected
                                  ? 'border-[var(--lx-accent)] bg-[var(--lx-accent-quiet)]'
                                  : 'border-[var(--lx-border)] bg-[var(--lx-surface)]'
                              }`}
                              type="button"
                            >
                              <StatusPill status={statusId} size="md" />
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    <div>
                      <label className={labelClassName}>city</label>
                      <Input
                        value={citySearch}
                        onChange={(event) => setCitySearch(event.target.value)}
                        className={fieldClassName}
                        placeholder={selectedCityName ?? 'search for your city'}
                      />
                      {selectedCityName && (
                        <div className="mt-2 font-mono text-[11px] text-text-faint">
                          selected: {selectedCityName}
                        </div>
                      )}
                      {(citySearch.trim()
                        ? cityResults
                        : cityResults.slice(0, 6)
                      )
                        .slice(0, 6)
                        .map((city) => (
                          <button
                            key={String(city._id)}
                            onClick={() => {
                              setSelectedCityId(String(city._id))
                              setSelectedCityName(city.displayName)
                              setCitySearch('')
                            }}
                            className="mt-2 w-full rounded border border-dashed border-line bg-transparent px-2.5 py-2 text-left font-mono text-[11.5px] text-text-muted"
                            type="button"
                          >
                            {city.displayName}
                          </button>
                        ))}
                    </div>
                  </div>
                </div>

                <div>
                  <div className={sectionTitleClassName}>social links</div>
                  <div className="flex flex-col gap-4">
                    <div>
                      <label className={labelClassName}>x</label>
                      <Input
                        value={twitter}
                        onChange={(event) => setTwitter(event.target.value)}
                        className={fieldClassName}
                        placeholder="@username"
                      />
                    </div>
                    <div>
                      <label className={labelClassName}>linkedin</label>
                      <Input
                        value={linkedin}
                        onChange={(event) => setLinkedin(event.target.value)}
                        className={fieldClassName}
                        placeholder="linkedin.com/in/username"
                      />
                    </div>
                    <div>
                      <label className={labelClassName}>bluesky</label>
                      <Input
                        value={bluesky}
                        onChange={(event) => setBluesky(event.target.value)}
                        className={fieldClassName}
                        placeholder="@username.bsky.social"
                      />
                    </div>
                    <div>
                      <label className={labelClassName}>website</label>
                      <Input
                        value={website}
                        onChange={(event) => setWebsite(event.target.value)}
                        className={fieldClassName}
                        placeholder="https://yoursite.dev"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex flex-wrap items-center gap-3">
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
                      <span className="flex items-center gap-1.5 font-mono text-xs text-success">
                        <CheckCircle2 size={14} /> saved
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {tab === 'privacy' && (
              <div className="flex max-w-[560px] flex-col gap-7">
                <div>
                  <div className={sectionTitleClassName}>visibility</div>
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
                    <div key={key} className={settingsRowClassName}>
                      <div>
                        <div className="mb-0.5 font-mono text-[13px] text-text">
                          {label}
                        </div>
                        <div className="font-sans text-xs text-text-faint">
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
              <div className="max-w-[560px]">
                <div className={sectionTitleClassName}>
                  notification preferences
                </div>
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
                  <div key={key} className={settingsRowClassName}>
                    <span className="font-mono text-[13px] text-text">
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
              <div className="flex max-w-[560px] flex-col gap-4">
                <div className={sectionTitleClassName}>connected accounts</div>
                <div className="flex items-center justify-between rounded-card border border-line bg-surface px-[18px] py-4 shadow-card">
                  <div className="flex items-center gap-3">
                    <BrandIcon name="github" size={18} />
                    <div>
                      <div className="font-mono text-[13px] font-semibold text-text">
                        GitHub
                      </div>
                      <div className="font-mono text-[11px] text-text-faint">
                        @{profile.viewer.githubUsername}
                      </div>
                    </div>
                  </div>
                  <span className="font-mono text-[11px] text-success">
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
                    hides your profile from Explore and public surfaces until
                    you reactivate.
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
      <style>{`
        @media (min-width: 1024px) {
          .lg\\:block {
            width: 220px !important;
            border-bottom: none !important;
            border-right: 1px solid var(--lx-border);
            padding: 16px 0 !important;
            overflow: visible !important;
          }
        }

        @media (min-width: 640px) {
          div[style*='grid-template-columns: minmax(0, 1fr);'] {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
      `}</style>
    </div>
  )
}
