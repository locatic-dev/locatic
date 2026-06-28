import { createFileRoute, Link } from '@tanstack/react-router'
import {
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { privateProfileOverviewQueryOptions } from '@/features/profile/queries'
import { viewerExplorePrefsQueryOptions } from '@/features/viewer/queries'
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
import {
  FormRoutePending,
  ROUTE_PENDING_MIN_MS,
  ROUTE_PENDING_MS,
} from '@/components/app-shell/route-pending'
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
import { PrivacyVisibilitySettings } from '@/features/settings/privacy-visibility-settings'
import {
  getSettingsAccountStateFromForm,
  getSettingsAccountStateFromViewer,
  getSettingsDirty,
  type SettingsAccountFormState,
} from '@/features/settings/dirty'
import { useUnsavedChangesGuard } from '@/features/settings/use-unsaved-changes-guard'

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
  pendingMs: ROUTE_PENDING_MS,
  pendingMinMs: ROUTE_PENDING_MIN_MS,
  component: SettingsPage,
})

const TABS = [
  { id: 'account', label: 'account' },
  { id: 'privacy', label: 'privacy' },
  { id: 'notifications', label: 'notifications' },
  { id: 'connected', label: 'connected accounts' },
  { id: 'danger', label: 'danger zone' },
] as const
type SettingsTab = (typeof TABS)[number]['id']

const fieldClassName = 'border-line bg-surface font-sans text-text'
const labelClassName = 'mb-1.5 block font-mono text-[11.5px] text-text-muted'
const sectionTitleClassName =
  'mb-4 font-mono text-[10.5px] font-semibold uppercase tracking-[0.06em] text-text-muted'
const settingsRowClassName =
  'flex items-center justify-between gap-4 border-b border-line py-3.5'

function SettingsPage() {
  const { tab } = Route.useSearch()
  const navigate = Route.useNavigate()
  const queryClient = useQueryClient()
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
  const viewerAccountState = getSettingsAccountStateFromViewer(profile.viewer)

  const [saved, setSaved] = useState(false)
  const [displayName, setDisplayName] = useState(viewerAccountState.displayName)
  const [bio, setBio] = useState(viewerAccountState.bio)
  const [buildStatus, setBuildStatus] = useState<BuildStatus>(
    viewerAccountState.buildStatus,
  )
  const [selectedCityId, setSelectedCityId] = useState<Id<'cities'> | null>(
    (viewerAccountState.cityId as Id<'cities'> | null) ?? null,
  )
  const [selectedCityName, setSelectedCityName] = useState<string | null>(
    profile.viewer.cityName,
  )
  const [twitter, setTwitter] = useState(viewerAccountState.twitter ?? '')
  const [linkedin, setLinkedin] = useState(viewerAccountState.linkedin ?? '')
  const [bluesky, setBluesky] = useState(viewerAccountState.bluesky ?? '')
  const [website, setWebsite] = useState(viewerAccountState.website ?? '')
  const [saving, setSaving] = useState(false)
  const [persistedAccountState, setPersistedAccountState] =
    useState<SettingsAccountFormState>(viewerAccountState)
  const allowNextNavigationRef = useRef(false)

  const cityResults =
    citySearch.trim().length > 0
      ? ((citySearchResultsQuery.data as Array<Doc<'cities'>> | undefined) ??
        [])
      : ((popularCitiesQuery.data as Array<Doc<'cities'>> | undefined) ?? [])

  const accountCurrent = getSettingsAccountStateFromForm({
    displayName,
    bio,
    buildStatus,
    cityId: selectedCityId ? String(selectedCityId) : null,
    twitter,
    linkedin,
    bluesky,
    website,
  })
  const isAccountDirty = getSettingsDirty(persistedAccountState, accountCurrent)

  const resetAccountForm = (
    nextState = persistedAccountState,
    nextCityName = profile.viewer.cityName,
  ) => {
    setDisplayName(nextState.displayName)
    setBio(nextState.bio)
    setBuildStatus(nextState.buildStatus)
    setSelectedCityId((nextState.cityId as Id<'cities'> | null) ?? null)
    setSelectedCityName(nextCityName)
    setTwitter(nextState.twitter ?? '')
    setLinkedin(nextState.linkedin ?? '')
    setBluesky(nextState.bluesky ?? '')
    setWebsite(nextState.website ?? '')
  }

  useEffect(() => {
    if (isAccountDirty) {
      return
    }

    setPersistedAccountState(viewerAccountState)
    resetAccountForm(viewerAccountState, profile.viewer.cityName)
  }, [data])

  useUnsavedChangesGuard(isAccountDirty, allowNextNavigationRef)

  const handleSettingsTabChange = (nextTab: SettingsTab) => {
    if (nextTab === tab) {
      return
    }

    if (
      tab === 'account' &&
      isAccountDirty &&
      !window.confirm('You have unsaved changes. Leave without saving?')
    ) {
      return
    }

    if (tab === 'account' && isAccountDirty) {
      resetAccountForm()
      allowNextNavigationRef.current = true
    }

    void navigate({
      to: '/settings',
      search: { tab: nextTab },
    })
  }

  const handleSaveAccount = async () => {
    setSaving(true)

    try {
      const submittedAccountState = getSettingsAccountStateFromForm({
        displayName,
        bio,
        buildStatus,
        cityId: selectedCityId ? String(selectedCityId) : null,
        twitter,
        linkedin,
        bluesky,
        website,
      })

      await updateProfile({
        displayName: submittedAccountState.displayName,
        bio: submittedAccountState.bio,
        cityId: selectedCityId,
        buildStatus: submittedAccountState.buildStatus,
        socialLinks: {
          github: profile.viewer.githubUsername,
          x: submittedAccountState.twitter,
          linkedin: submittedAccountState.linkedin,
          bluesky: submittedAccountState.bluesky,
          website: submittedAccountState.website,
        },
      })
      setPersistedAccountState(submittedAccountState)
      resetAccountForm(submittedAccountState, selectedCityName)
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: privateProfileOverviewQueryOptions().queryKey,
        }),
        queryClient.invalidateQueries({
          queryKey: viewerExplorePrefsQueryOptions().queryKey,
        }),
      ])
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
        <nav className="lx-settings-tabs">
          {TABS.map((tabItem) => (
            <button
              key={tabItem.id}
              onClick={() => handleSettingsTabChange(tabItem.id)}
              className={`-mb-px inline-flex min-h-11 items-end whitespace-nowrap border-b-2 px-2 pb-2.5 font-mono text-[12px] transition-colors ${
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
          <div className="lx-page-width-form-left">
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
                            <div key={statusId} className="sm:last:col-span-2">
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

                <div>
                  <div className={sectionTitleClassName}>legal</div>
                  <nav className="flex flex-wrap gap-x-5 gap-y-1 font-mono text-[12px]">
                    <Link
                      to="/privacy"
                      className="inline-flex min-h-11 items-center text-text-muted no-underline transition-colors hover:text-text"
                    >
                      privacy policy
                    </Link>
                    <Link
                      to="/terms"
                      className="inline-flex min-h-11 items-center text-text-muted no-underline transition-colors hover:text-text"
                    >
                      terms of service
                    </Link>
                  </nav>
                </div>
              </div>
            )}

            {tab === 'privacy' && (
              <div className="flex max-w-140 flex-col gap-7">
                <div>
                  <div className={sectionTitleClassName}>visibility</div>
                  <PrivacyVisibilitySettings
                    privacy={profile.viewer.privacy}
                    settingsRowClassName={settingsRowClassName}
                    onUpdate={async (nextPrivacy) => {
                      try {
                        await updatePrivacy(nextPrivacy)
                      } catch (error) {
                        console.error(error)
                      }
                    }}
                  />
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
                  { key: 'updateLikes', label: 'likes on your posts' },
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

            {tab === 'account' && (isAccountDirty || saving || saved) && (
              <div className="lx-fade-up sticky bottom-[var(--lx-mobile-tab-height)] z-10 mt-8 flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 py-3 shadow-floating md:bottom-4">
                {saved && !isAccountDirty ? (
                  <span className="flex items-center gap-1.5 font-mono text-[11.5px] text-success">
                    <CheckCircle2 size={14} /> saved
                  </span>
                ) : (
                  <>
                    <span className="font-mono text-[11.5px] text-text-muted">
                      unsaved changes
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        onClick={() => resetAccountForm()}
                        disabled={saving || !isAccountDirty}
                        variant="monoOutline"
                        size="meta"
                        className="font-mono"
                      >
                        discard
                      </Button>
                      <Button
                        onClick={() => void handleSaveAccount()}
                        disabled={
                          saving || !isAccountDirty || !displayName.trim()
                        }
                        variant="brand"
                        size="meta"
                        className="font-mono"
                      >
                        {saving ? 'saving…' : 'save changes'}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
