import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { privateProfileOverviewQueryOptions } from '@/features/profile/queries'
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
import { CityCombobox } from '@/components/ui/city-combobox'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { BrandIcon } from '@/components/ui/brand-icon'
import { FormRoutePending } from '@/components/app-shell/route-pending'
import { CheckCircle2 } from '@/lib/icons'
import { RepositoryManagerDialog } from '@/features/github/repository-manager-dialog'
import {
  BUILD_STATUS,
  StatusPill,
  type BuildStatus,
} from '@/components/ui/status-pill'
import {
  mapPrivateProfileOverview,
  type PrivateProfileOverviewPayload,
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
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(privateProfileOverviewQueryOptions()),
  pendingComponent: FormRoutePending,
  pendingMs: 250,
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
  const { tab } = Route.useSearch()
  const navigate = Route.useNavigate()
  const { data } = useSuspenseQuery(privateProfileOverviewQueryOptions())
  const profile = mapPrivateProfileOverview(
    data as PrivateProfileOverviewPayload | undefined,
  )
  if (!profile) {
    throw new Error('Settings data was not available')
  }

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
  const [selectedCityId, setSelectedCityId] = useState<Id<'cities'> | null>(
    null,
  )
  const [selectedCityName, setSelectedCityName] = useState<string | null>(null)
  const [twitter, setTwitter] = useState('')
  const [linkedin, setLinkedin] = useState('')
  const [bluesky, setBluesky] = useState('')
  const [website, setWebsite] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setDisplayName(profile.viewer.displayName)
    setBio(profile.viewer.bio)
    setBuildStatus(profile.viewer.buildStatus)
    setSelectedCityId(profile.viewer.cityId ?? null)
    setSelectedCityName(profile.viewer.cityName)
    setTwitter(profile.viewer.socialLinks.x ?? '')
    setLinkedin(profile.viewer.socialLinks.linkedin ?? '')
    setBluesky(profile.viewer.socialLinks.bluesky ?? '')
    setWebsite(profile.viewer.socialLinks.website ?? '')
  }, [data])

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
        cityId: selectedCityId,
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
      <div className="shrink-0 border-b border-line px-(--lx-gutter) pt-5">
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
                  search: { tab: tabItem.id },
                })
              }
              className={`mb-px whitespace-nowrap border-b-2 px-1 pb-2.5 font-mono text-[12px] transition-colors ${
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
                      <label
                        htmlFor="settings-display-name"
                        className={labelClassName}
                      >
                        display name
                      </label>
                      <Input
                        id="settings-display-name"
                        value={displayName}
                        onChange={(event) => setDisplayName(event.target.value)}
                        className={fieldClassName}
                        placeholder="your display name"
                      />
                    </div>

                    <div>
                      <label htmlFor="settings-bio" className={labelClassName}>
                        bio{' '}
                        <span className="text-text-faint">
                          ({bio.length}/140)
                        </span>
                      </label>
                      <Textarea
                        id="settings-bio"
                        value={bio}
                        onChange={(event) =>
                          setBio(event.target.value.slice(0, 140))
                        }
                        className={`${fieldClassName} resize-none`}
                        rows={3}
                        placeholder="what are you building?"
                      />
                    </div>

                    <fieldset>
                      <legend className={labelClassName}>build status</legend>
                      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                        {(
                          Object.entries(BUILD_STATUS) as Array<
                            [BuildStatus, (typeof BUILD_STATUS)[BuildStatus]]
                          >
                        ).map(([statusId]) => {
                          const selected = buildStatus === statusId
                          const inputId = `settings-build-status-${statusId}`

                          return (
                            <div key={statusId}>
                              <input
                                id={inputId}
                                type="radio"
                                name="settings-build-status"
                                value={statusId}
                                checked={selected}
                                onChange={(event) => {
                                  if (event.target.checked) {
                                    setBuildStatus(statusId)
                                  }
                                }}
                                className="peer sr-only"
                              />
                              <label
                                htmlFor={inputId}
                                className={`block cursor-pointer rounded border px-3.5 py-3 text-left transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-brand/40 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-canvas ${
                                  selected
                                    ? 'border-brand bg-brand-quiet'
                                    : 'border-line bg-surface'
                                }`}
                              >
                                <StatusPill status={statusId} size="md" />
                              </label>
                            </div>
                          )
                        })}
                      </div>
                    </fieldset>

                    <div>
                      <label htmlFor="settings-city" className={labelClassName}>
                        city
                      </label>
                      <CityCombobox
                        id="settings-city"
                        label="Search for your city"
                        query={citySearch}
                        onQueryChange={setCitySearch}
                        cities={(citySearch.trim()
                          ? cityResults
                          : cityResults.slice(0, 6)
                        ).slice(0, 6)}
                        onSelectCity={(city) => {
                          setSelectedCityId(city._id)
                          setSelectedCityName(city.displayName)
                          setCitySearch('')
                        }}
                        placeholder={selectedCityName ?? 'search for your city'}
                        inputClassName={fieldClassName}
                        maxResults={6}
                      />
                      {selectedCityName && (
                        <div className="mt-2 font-mono text-[11px] text-text-faint">
                          selected: {selectedCityName}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <div className={sectionTitleClassName}>social links</div>
                  <div className="flex flex-col gap-4">
                    <div>
                      <label
                        htmlFor="settings-twitter"
                        className={labelClassName}
                      >
                        x
                      </label>
                      <Input
                        id="settings-twitter"
                        value={twitter}
                        onChange={(event) => setTwitter(event.target.value)}
                        className={fieldClassName}
                        placeholder="@username"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="settings-linkedin"
                        className={labelClassName}
                      >
                        linkedin
                      </label>
                      <Input
                        id="settings-linkedin"
                        value={linkedin}
                        onChange={(event) => setLinkedin(event.target.value)}
                        className={fieldClassName}
                        placeholder="linkedin.com/in/username"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="settings-bluesky"
                        className={labelClassName}
                      >
                        bluesky
                      </label>
                      <Input
                        id="settings-bluesky"
                        value={bluesky}
                        onChange={(event) => setBluesky(event.target.value)}
                        className={fieldClassName}
                        placeholder="@username.bsky.social"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="settings-website"
                        className={labelClassName}
                      >
                        website
                      </label>
                      <Input
                        id="settings-website"
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
                      variant="brand"
                      size="meta"
                      className="font-mono"
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
              <div className="flex max-w-140 flex-col gap-7">
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
              <div className="max-w-140">
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
              <div className="flex max-w-140 flex-col gap-4">
                <div className={sectionTitleClassName}>connected accounts</div>
                <div className="flex items-center justify-between rounded-card border border-line bg-surface px-4.5 py-4 shadow-card">
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
                <div className="rounded-card border border-line bg-surface px-4.5 py-4 shadow-card">
                  <div className="mb-3">
                    <div className="mb-0.5 font-mono text-[13px] text-text">
                      manage repositories
                    </div>
                    <div className="font-sans text-xs leading-5 text-text-faint">
                      Add, hide, restore, or pin public GitHub repos after
                      onboarding. Locatic likes stay separate from GitHub stars.
                    </div>
                  </div>
                  <RepositoryManagerDialog
                    buttonLabel="manage repositories"
                    buttonVariant="monoOutline"
                    buttonSize="meta"
                    title="Manage repositories"
                    description="Search up to 1,000 public GitHub repos we can load for your account, then add, hide, restore, or pin the ones that belong on your Locatic profile."
                    emptyStateCopy="No imported or public GitHub repositories are available yet."
                    pinnedProjectIds={profile.viewer.pinnedProfileProjectIds}
                    profileUsername={profile.viewer.githubUsername}
                  />
                </div>
              </div>
            )}

            {tab === 'danger' && (
              <div className="flex max-w-140 flex-col gap-5">
                <div className="rounded-[6px] border border-line bg-surface p-5">
                  <div className="mb-2 font-mono text-[13px] font-semibold text-text">
                    deactivate account
                  </div>
                  <p className="mb-3.5 mt-0 font-sans text-[13px] leading-normal text-text-muted">
                    hides your profile from Explore and public surfaces until
                    you reactivate.
                  </p>
                  <Button
                    variant="monoOutline"
                    size="meta"
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
                    className="font-mono"
                  >
                    deactivate account
                  </Button>
                </div>

                <div className="rounded-[6px] border border-danger/40 bg-danger/4 p-5">
                  <div className="mb-2 font-mono text-[13px] font-semibold text-danger">
                    delete account
                  </div>
                  <p className="mb-3.5 mt-0 font-sans text-[13px] leading-normal text-text-muted">
                    permanently removes all your Locatic data. this cannot be
                    undone.
                  </p>
                  <Button
                    variant="destructive"
                    size="meta"
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
                    className="font-mono"
                  >
                    delete account permanently
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
