import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { domAnimation, LazyMotion } from 'motion/react'
import { PersonRow } from '@/components/ui/person-row'
import {
  AppearInExploreSetting,
  CityVisibilitySettings,
  type CityVisibility,
} from '@/features/settings/location-discovery-settings'
import { LegalPage } from '@/features/legal/legal-page'
import { TERMS_MARKDOWN } from '@/features/legal/terms-content'
import { PRIVACY_MARKDOWN } from '@/features/legal/privacy-content'
import {
  LEGAL_EFFECTIVE_DATE,
  LEGAL_LAST_UPDATED,
  PRIVACY_LAST_UPDATED,
} from '@/features/legal/legal-dates'
import { InboxFixture, RecoveryFixture } from './lifecycle-inbox-fixtures'
import './fixture.css'

// Real production UI with a memory boundary. This is not provider/auth/SSR QA.
function SettingsFixture() {
  const [cityVisibility, setCityVisibility] =
    useState<CityVisibility>('exact_city')
  const [discoverable, setDiscoverable] = useState(true)
  const [following, setFollowing] = useState(false)
  const rowClass = 'flex min-h-16 items-center gap-4 border-b border-line py-3'
  return (
    <main id="main-content" className="mx-auto max-w-3xl p-4 md:p-8">
      <h1 className="text-headline">Privacy and discovery</h1>
      <p className="text-body text-text-muted">
        Browser QA · dummy data and in-memory saves
      </p>
      <CityVisibilitySettings
        value={cityVisibility}
        cityName="Bengaluru, Karnataka, India"
        regionLabel="Karnataka, India"
        settingsRowClassName={rowClass}
        onChange={async (value) => setCityVisibility(value)}
      />
      <AppearInExploreSetting
        value={discoverable}
        settingsRowClassName={rowClass}
        onChange={async (value) => setDiscoverable(value)}
      />
      <section
        aria-label="Builder identity preview"
        className="mt-8 rounded-card border border-line p-4"
      >
        <PersonRow
          avatarName="Alexandria"
          title="Alexandria Montgomery-Chandrasekhar"
          meta="@alexandria-montgomery-chandrasekhar"
          subtitle="open to collaborate"
          location={
            cityVisibility === 'hidden'
              ? { kind: 'none' }
              : cityVisibility === 'region_only'
                ? { kind: 'region', regionLabel: 'Karnataka, India' }
                : {
                    kind: 'city',
                    cityId: 'fixture-bengaluru',
                    citySlug: 'bengaluru-in',
                    cityName: 'Bengaluru, Karnataka, India',
                  }
          }
          action={
            <button
              type="button"
              className="min-h-11 rounded-control border border-control px-3 text-label"
              onClick={() => setFollowing(!following)}
            >
              {following ? 'following' : 'follow'}
            </button>
          }
        />
      </section>
      <nav aria-label="Legal documents" className="mt-8 flex gap-6">
        <a href="/terms">terms of service</a>
        <a href="/privacy">privacy policy</a>
      </nav>
    </main>
  )
}

const root = createRootRouteWithContext<{
  auth: { isAuthenticated: boolean }
}>()({ component: Outlet })
const settings = createRoute({
  getParentRoute: () => root,
  path: '/',
  component: SettingsFixture,
})
const terms = createRoute({
  getParentRoute: () => root,
  path: '/terms',
  component: () => (
    <LegalPage
      title="Terms of Service"
      effective={LEGAL_EFFECTIVE_DATE}
      lastUpdated={LEGAL_LAST_UPDATED}
      markdown={TERMS_MARKDOWN}
    />
  ),
})
const privacy = createRoute({
  getParentRoute: () => root,
  path: '/privacy',
  component: () => (
    <LegalPage
      title="Privacy Policy"
      effective={LEGAL_EFFECTIVE_DATE}
      lastUpdated={PRIVACY_LAST_UPDATED}
      markdown={PRIVACY_MARKDOWN}
    />
  ),
})
const inbox = createRoute({
  getParentRoute: () => root,
  path: '/inbox',
  component: InboxFixture,
})
const recovery = createRoute({
  getParentRoute: () => root,
  path: '/recovery',
  component: RecoveryFixture,
})
const router = createRouter({
  routeTree: root.addChildren([settings, terms, privacy, inbox, recovery]),
  context: { auth: { isAuthenticated: false } },
})

createRoot(document.getElementById('root')!).render(
  <LazyMotion features={domAnimation}>
    <RouterProvider router={router} />
  </LazyMotion>,
)
