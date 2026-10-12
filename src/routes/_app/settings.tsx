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
  useUpdateExploreConfig,
  useUpdateEmailPreference,
  useUpdateNotificationPref,
  useUpdatePrivacy,
  useUpdateProfile,
} from '@/features/settings/mutations'
import { AccountDangerZone } from '@/features/settings/account-danger-zone'
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
import { useRevealActiveTab } from '@/components/app-shell/use-reveal-active-tab'
import { getActionErrorMessage, reportActionError } from '@/lib/action-error'
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
  AppearInExploreSetting,
  CityVisibilitySettings,
} from '@/features/settings/location-discovery-settings'
import { ThemePicker } from '@/features/settings/theme-picker'
import {
  getSettingsAccountStateFromForm,
  getSettingsAccountStateFromViewer,
  getSettingsDirty,
  type SettingsAccountFormState,
} from '@/features/settings/dirty'
import { useUnsavedChangesGuard } from '@/features/settings/use-unsaved-changes-guard'
import { EmailPreferencesSection } from '@/features/settings/email-preferences-section'
import { myEmailStatusQueryOptions } from '@/features/settings/queries'
import { viewerQueryOptions } from '@/features/viewer/queries'
import { shouldPrefetchPrivateConvexQueries } from '@/lib/auth-routing'

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
  loader: async ({ context }) => {
    // Client navigations fetch in the page, once Convex auth is ready.
    if (!shouldPrefetchPrivateConvexQueries()) {
      return
    }

    await Promise.all([
      context.queryClient.ensureQueryData(privateProfileOverviewQueryOptions()),
      context.queryClient.ensureQueryData(myEmailStatusQueryOptions()),
    ])
  },
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

// Fields keep the primitives' control border (3:1 against the surface) and
// mono type; only the bio reads as prose.
const fieldClassName = 'bg-surface text-text'
const labelClassName = 'mb-1.5 block font-mono text-label text-text-muted'
const sectionTitleClassName = 'mb-4 text-eyebrow text-text-muted'
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
  const citySearchResultsQuery = useQuery(
    citiesSearchQueryOptions(citySearch.trim()),
  )

  const updateProfile = useUpdateProfile()
  const updatePrivacy = useUpdatePrivacy()
  const updateExploreConfig = useUpdateExploreConfig()
  const updateNotifPref = useUpdateNotificationPref()
  const updateEmailPreference = useUpdateEmailPreference()
  const emailStatusQuery = useQuery(myEmailStatusQueryOptions())
  const bootstrapQuery = useQuery(viewerQueryOptions())
  const isEmailAdmin = bootstrapQuery.data?.isEmailAdmin === true
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
  const [saveError, setSaveError] = useState<string | null>(null)
  const [persistedAccountState, setPersistedAccountState] =
    useState<SettingsAccountFormState>(viewerAccountState)
  const allowNextNavigationRef = useRef(false)
  const tabRowRef = useRef<HTMLElement>(null)
  useRevealActiveTab(tabRowRef, tab)

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

  // Privacy settings save on change, so there is nothing to leave unsaved; a
  // failed save reports through the shared action-error toast with a retry
  // (A5), and the control falls back to the saved value.
  const savePrivacySetting = async (save: () => Promise<unknown>) => {
    try {
      await save()
    } catch (error) {
      reportActionError(error, {
        title: "couldn't save privacy setting",
        retry: () => {
          void save().catch((e) =>
            reportActionError(e, { title: "couldn't save privacy setting" }),
          )
        },
      })
    }
  }

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
    setSaveError(null)

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
      setSaveError(getActionErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="lx-page-shell">
      <div className="shrink-0 border-b border-line px-(--lx-gutter) pt-5">
        <h1 className="mb-4 text-headline text-text">settings</h1>
        {/* One scrollable row on phones; the current tab is kept in view.
            Pulled left by the tab padding so the first label lines up with
            the title. */}
        <nav
          ref={tabRowRef}
          aria-label="settings sections"
          className="lx-settings-tabs relative -ml-2"
        >
          {TABS.map((tabItem) => (
            <button
              key={tabItem.id}
              onClick={() => handleSettingsTabChange(tabItem.id)}
              className={`-mb-px inline-flex min-h-11 shrink-0 items-end whitespace-nowrap border-b-2 px-2 pb-2.5 text-label transition-colors ${
                tab === tabItem.id
                  ? 'border-text font-semibold text-text'
                  : 'border-transparent text-text-muted hover:text-text'
              }`}
              type="button"
              aria-current={tab === tabItem.id ? 'true' : undefined}
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
                        <span className="text-text-muted">
                          ({bio.length}/140)
                        </span>
                      </label>
                      <Textarea
                        id="settings-bio"
                        value={bio}
                        onChange={(event) =>
                          setBio(event.target.value.slice(0, 140))
                        }
                        className={`${fieldClassName} resize-none font-sans`}
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
                                className={`block cursor-pointer rounded border px-3.5 py-3 text-left transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus ${
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
                        <div className="mt-2 font-mono text-meta text-text-muted">
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
                  <div className={sectionTitleClassName}>appearance</div>
                  <ThemePicker />
                  <div className="mt-2 font-sans text-xs leading-5 text-text-muted">
                    accent theme for this device. saved locally.
                  </div>
                </div>

                <div>
                  <div className={sectionTitleClassName}>legal</div>
                  <nav className="flex flex-wrap gap-x-5 gap-y-1 font-mono text-label">
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
                    onUpdate={(nextPrivacy) =>
                      savePrivacySetting(() => updatePrivacy(nextPrivacy))
                    }
                  />
                </div>
                <div>
                  <div className={sectionTitleClassName}>
                    location and discovery
                  </div>
                  <CityVisibilitySettings
                    value={profile.viewer.privacy.cityVisibility}
                    cityName={profile.viewer.cityName}
                    regionLabel={profile.regionLabel}
                    settingsRowClassName={settingsRowClassName}
                    onChange={(cityVisibility) =>
                      // Only the changed field: the server merges it, so a
                      // save never replays other settings from this render.
                      savePrivacySetting(() =>
                        updatePrivacy({ cityVisibility }),
                      )
                    }
                  />
                  <AppearInExploreSetting
                    value={profile.viewer.appearInExplore}
                    settingsRowClassName={settingsRowClassName}
                    onChange={(appearInExplore) =>
                      savePrivacySetting(() =>
                        updateExploreConfig({
                          cityIds: profile.viewer.exploreConfig.cityIds,
                          stackPrefs: profile.viewer.exploreConfig.stackPrefs,
                          appearInExplore,
                        }),
                      )
                    }
                  />
                </div>
              </div>
            )}

            {tab === 'notifications' && (
              <div className="max-w-140">
                <div className={sectionTitleClassName}>
                  notification preferences
                </div>
                {(
                  [
                    { key: 'projectLikes', label: 'likes on your projects' },
                    { key: 'updateLikes', label: 'likes on your posts' },
                    { key: 'comments', label: 'comments on your projects' },
                    {
                      key: 'commentReplies',
                      label: 'replies to your comments',
                    },
                    { key: 'newFollowers', label: 'new followers' },
                    { key: 'dms', label: 'direct messages' },
                    {
                      key: 'contributorRecognized',
                      label: 'contributor recognition',
                    },
                  ] as const
                ).map(({ key, label }) => (
                  <div key={key} className={settingsRowClassName}>
                    {/* The label toggles the switch too: a 44px+ target. */}
                    <label
                      id={`notification-pref-${key}-label`}
                      htmlFor={`notification-pref-${key}`}
                      className="flex min-h-11 flex-1 cursor-pointer items-center text-label text-text"
                    >
                      {label}
                    </label>
                    <Switch
                      id={`notification-pref-${key}`}
                      aria-labelledby={`notification-pref-${key}-label`}
                      checked={profile.viewer.notificationPrefs[key]}
                      onCheckedChange={async (checked) => {
                        // One key per call: a stale tab cannot restore others.
                        const change = { key, value: checked }
                        try {
                          await updateNotifPref(change)
                        } catch (error) {
                          reportActionError(error, {
                            title: "couldn't save notification setting",
                            retry: () => {
                              void updateNotifPref(change).catch((e) =>
                                reportActionError(e, {
                                  title: "couldn't save notification setting",
                                }),
                              )
                            },
                          })
                        }
                      }}
                    />
                  </div>
                ))}
                <EmailPreferencesSection
                  status={emailStatusQuery.data}
                  isEmailAdmin={isEmailAdmin}
                  onChange={(category, subscribed) => {
                    const change = { category, subscribed }
                    updateEmailPreference(change).catch((error: unknown) =>
                      reportActionError(error, {
                        title: "couldn't save email setting",
                        retry: () => {
                          void updateEmailPreference(change).catch((e) =>
                            reportActionError(e, {
                              title: "couldn't save email setting",
                            }),
                          )
                        },
                      }),
                    )
                  }}
                />
              </div>
            )}

            {tab === 'connected' && (
              <div className="flex max-w-140 flex-col gap-4">
                <div className={sectionTitleClassName}>connected accounts</div>
                <div className="flex items-center justify-between rounded-card border border-line bg-surface px-4.5 py-4 shadow-card">
                  <div className="flex items-center gap-3">
                    <BrandIcon name="github" size={18} />
                    <div>
                      <div className="text-label font-semibold text-text">
                        GitHub
                      </div>
                      <div className="font-mono text-meta text-text-muted">
                        @{profile.viewer.githubUsername}
                      </div>
                    </div>
                  </div>
                  <span className="font-mono text-meta text-success">
                    connected
                  </span>
                </div>
                <div className="rounded-card border border-line bg-surface px-4.5 py-4 shadow-card">
                  <div className="mb-3">
                    <div className="mb-0.5 text-label text-text">
                      manage repositories
                    </div>
                    <div className="font-sans text-xs leading-5 text-text-muted">
                      Add, hide, restore, or pin public GitHub repos after
                      onboarding. Locatic likes stay separate from GitHub stars.
                    </div>
                  </div>
                  <RepositoryManagerDialog
                    buttonLabel="manage repositories"
                    buttonSize="touch"
                    title="Manage repositories"
                    description="Search up to 1,000 public GitHub repos we can load for your account, then add, hide, restore, or pin the ones that belong on your Locatic profile."
                    emptyStateCopy="No imported or public GitHub repositories are available yet."
                    pinnedProjectIds={profile.viewer.pinnedProfileProjectIds}
                    profileUsername={profile.viewer.githubUsername}
                  />
                </div>
              </div>
            )}

            {tab === 'danger' && <AccountDangerZone />}

            {tab === 'account' && (isAccountDirty || saving || saved) && (
              <div className="lx-fade-up sticky bottom-[var(--lx-mobile-tab-height)] z-10 mt-8 flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 py-3 shadow-floating md:bottom-4">
                {saved && !isAccountDirty ? (
                  <span className="flex items-center gap-1.5 font-mono text-label text-success">
                    <CheckCircle2 size={14} /> saved
                  </span>
                ) : (
                  <>
                    <span className="font-mono text-label text-text-muted">
                      unsaved changes
                    </span>
                    {saveError && (
                      <p
                        role="alert"
                        className="m-0 font-mono text-label text-danger"
                      >
                        {saveError}
                      </p>
                    )}
                    <div className="flex items-center gap-2">
                      <Button
                        onClick={() => {
                          setSaveError(null)
                          resetAccountForm()
                        }}
                        disabled={saving || !isAccountDirty}
                        size="touch"
                      >
                        discard
                      </Button>
                      <Button
                        onClick={() => void handleSaveAccount()}
                        disabled={
                          saving || !isAccountDirty || !displayName.trim()
                        }
                        variant="primary"
                        size="touch"
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
