# SEO, AEO and Agent Readiness Launch Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.
>
> **Commits:** the repository owner commits only on explicit request. Each task ends with a suggested commit; run it only when the owner has asked for commits in the session. Never add AI attribution trailers.

**Goal:** Make every public Locatic page crawlable, canonical, well described and machine-readable, then take the whole `dev` branch live by merging it into `main`.

**Architecture:** Keep page heads in `src/lib/seo.ts` and add a sibling `src/lib/structured-data.ts` for JSON-LD. Crawl policy (robots, noindex, thin-page rules) lives in pure, unit-tested helpers. Routes compose those helpers in `head()`. Data needed for links and schema comes from the existing privacy-filtered Convex payloads, extended only where a field is missing (city slug, city last activity). Edge caching and OG image rendering stay outside the request path's CPU budget: the Worker only matches cached responses or streams stored images, while Convex Node actions render OG images ahead of time.

**Tech Stack:** TanStack Start 1.168 / Router 1.170 on Cloudflare Workers (free plan: 3 MB compressed script, 10 ms CPU per request), Convex 1.46, Clerk, Vitest, Playwright, satori + resvg (Convex Node runtime only).

---

## Implementation status (2026-10-18, branch `feat/seo-aeo-launch`)

Done: A1–A7, B1–B6, C1–C5, D1–D3, E1. Not started: D4 (OG images; its spike needs a deploy to the Convex deployment that also serves development.locatic.dev), E2–E5.

Deviations from the tasks below:

- **JSON-LD renders in page components, not `head().scripts`** (`src/components/ui/json-ld.tsx`). Route options ship in the initial client entry (code splitting is off), and the head version pushed it 0.8 KiB over the 85 KiB budget. Search engines read JSON-LD anywhere in the document. The FAQ text lives in `about-faq-content.ts` for the same reason.
- **Edge cache keys include a per-build id** (`__LOCATIC_BUILD_ID__`, `vite.config.ts` `define`), so HTML cached by one deployment never references another deployment's hashed assets. It is off under `vite dev`, and responses marked `private`/`no-store` are never stored.
- **`wrangler.jsonc` `main` is `./src/server.ts`.** With the Cloudflare Vite plugin, TanStack Start does not pick up `src/server.ts` on its own.
- **Explore builder rows are links** (`nearby-builder-row.tsx`), so server HTML links to profiles. The project canonical redirect is now 301, like the city id redirect.
- **The city header keeps the count line for empty cities**; cities with builders show the `describeCity` sentence instead.
- **The edge cache stores only renders Clerk marks `signed-out`** and skips requests with an `Authorization` header. Clerk sets `x-clerk-auth-status` only on signed-out results, so a missing header can be a Bearer-authenticated member render. Stale refreshes are coalesced per isolate and cache key.
- **City slugs on snapshots stop at live reads.** Comment authors' live location carries `citySlug` (`convex/comments.ts`), so comment pills link to the slug. Stored home-feed and post actor snapshots stay `{ cityId, cityName }`; their pills link by id and take the 301. Adding the slug there means writing it into stored snapshots and their refresh comparisons, which is left for later.
- **`pnpm seo:check` fails on a broken sitemap:** it requires the static entries in the sitemap and checks `/`, `/about`, `/explore`, `/privacy` and `/terms` directly.
- **The FAQ was checked against the code:** repositories are listed with `visibility=public`, the only GitHub POST is a GraphQL read, and "can't find my city" keeps global Explore.

## 1. Vision and success criteria

Locatic is a social network for developers that shows what people are building in each city. Search engines, AI answer engines and agents should be able to answer three questions from our own pages, without running JavaScript:

1. **What is Locatic?** One plain definition, the same everywhere (site, GitHub org, social profiles).
2. **Who is building what in {city}?** City pages that are real, data-backed answers, indexed only once they have enough substance.
3. **Who is this builder / what is this project?** Profile and project pages with clean canonicals, internal links and structured data that respect each builder's location privacy.

Launch is done when, on `https://locatic.dev`:

- Every URL in `/sitemap.xml` returns 200 with no redirect, and its canonical equals its own URL.
- `https://www.locatic.dev` and `http://` variants 301 to `https://locatic.dev/…`.
- Raw HTML (no JS) of `/`, `/about`, `/explore`, a city, a profile and a project contains the page's main text, internal `<a href>` links to related public pages, and valid JSON-LD (Rich Results Test passes with no errors).
- Search crawlers, AI search crawlers and AI training crawlers get 200 on public pages; private paths stay disallowed.
- `development.locatic.dev` and preview hosts are `noindex` and `Disallow: /`.
- Median TTFB for signed-out cached pages is under 200 ms.

## 2. Decisions (agreed 2026-10-17, don't relitigate)

| Topic          | Decision                                                                                                                                                                |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Release scope  | Everything in the audit ships in this release (sections 3–8 below).                                                                                                     |
| AI crawlers    | Allow search, user-fetch and training crawlers on public pages. Private app paths stay disallowed.                                                                      |
| GitHub links   | Point to the org page `https://github.com/locatic-dev` until the repo is public.                                                                                        |
| Pricing        | No pricing claims in copy or schema.                                                                                                                                    |
| Positioning    | Titles and first sentences lead with "find developers and projects in your city". The hero H1 stays "github, with a map."                                               |
| Thin pages     | City pages index once they have 3 or more counted builders; profiles once they have at least 1 visible project. Below that: `noindex, follow`, left out of the sitemap. |
| About          | New public `/about` route. The landing nav links to it; the in-app account menu keeps the dialog, which renders the same content.                                       |
| New page types | None. Enrich existing city pages instead of adding city × language or topic pages.                                                                                      |
| Founder name   | "Avinash Changrani" (fix the About copy).                                                                                                                               |
| Edge cache     | Cache signed-out HTML for public pages only (about 60 s fresh, served stale while refreshing).                                                                          |
| OG images      | Free Workers plan, so rendering happens in a Convex Node action and the Worker only streams the stored PNG.                                                             |

**Out of scope:** city × language/topic pages, WebMCP, pricing pages, a blog, enforcing the CSP (stays report-only per PR #36), email changes, any redesign of page layouts beyond what a task names.

## 3. Before you start

1. Work on a branch off `dev` (ask the owner whether to use a separate worktree or the main one): `feat/seo-aeo-launch`.
2. Read `AGENTS.md`, `src/routes/AGENTS.md`, `src/lib/AGENTS.md`, `convex/AGENTS.md`, `playwright/AGENTS.md`, `src/lib/seo.ts`, `src/lib/sitemap.ts`, `src/lib/security-headers.ts`, `convex/sitemap.ts`.
3. Baseline: `pnpm ci:quality` and `pnpm ci:build` must pass before any change. Record any pre-existing failures (PR #36 noted `focus-contract.test.ts` on Windows and a timing-sensitive `onboarding.test.tsx`).
4. Never edit `src/routeTree.gen.ts` or `convex/_generated/` by hand; `pnpm dev` and `convex dev` regenerate them.
5. New e2e checks for this plan go in one new file, `playwright/seo.public.spec.ts`, using the fixture conventions in `playwright/fixtures/fixtures.md` (use the public persona from `playwright/fixtures/personas.ts` for profile and project paths).

---

## Phase A — Crawl and canonical correctness (ship blockers)

### Task A1: `noindex` everything that is not the production host

`development.locatic.dev` and `*.workers.dev` previews are currently indexable.

**Files:**

- Modify: `src/lib/security-headers.ts`
- Test: `src/lib/__tests__/security-headers.test.ts`

**Step 1: Write the failing tests** (add to the existing describe block)

```ts
it('marks non-production hosts noindex', () => {
  for (const href of [
    'https://development.locatic.dev/',
    'https://locatic.example.workers.dev/',
    'http://localhost:3000/',
  ]) {
    expect(securityHeaders(new URL(href))['X-Robots-Tag']).toBe(
      'noindex, nofollow',
    )
  }
})

it('lets the production host be indexed', () => {
  expect(
    securityHeaders(new URL('https://locatic.dev/'))['X-Robots-Tag'],
  ).toBeUndefined()
})
```

**Step 2:** Run `pnpm vitest run src/lib/__tests__/security-headers.test.ts`. Expected: the two new tests FAIL.

**Step 3: Implement**

```ts
/** True only for https://locatic.dev: the one host search engines may index. */
export function isProductionHost(url: URL): boolean {
  return url.protocol === 'https:' && url.host === PRODUCTION_HOST
}

export function securityHeaders(url: URL): Record<string, string> {
  const production = isProductionHost(url)
  return {
    ...(production
      ? { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains' }
      : // Development and preview deployments mirror production; keep them
        // out of every index so they never compete with locatic.dev.
        { 'X-Robots-Tag': 'noindex, nofollow' }),
    // …existing headers unchanged
  }
}
```

Update the HSTS doc comment to say both headers key off `isProductionHost`.

**Step 4:** Run the test file again. Expected: PASS.

**Step 5: Commit:** `fix(seo): keep non-production hosts out of search indexes`

### Task A2: Serve `robots.txt` from a host-aware server route

A static `public/robots.txt` is served by Workers static assets before the Worker runs, so it can't vary by host. Move it to a route.

**Files:**

- Create: `src/lib/robots.ts`, `src/routes/robots[.]txt.ts`
- Delete: `public/robots.txt`
- Test: `src/lib/__tests__/robots.test.ts`
- Modify: `playwright/links.public.spec.ts` (only if it asserts the old file's exact text)

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { PRIVATE_PATHS, renderRobotsTxt } from '../robots'

describe('renderRobotsTxt', () => {
  it('blocks every crawler on non-production hosts', () => {
    expect(
      renderRobotsTxt(new URL('https://development.locatic.dev/robots.txt')),
    ).toBe('User-agent: *\nDisallow: /\n')
  })

  it('opens public pages in production and keeps private paths out', () => {
    const body = renderRobotsTxt(new URL('https://locatic.dev/robots.txt'))
    expect(body).toContain('User-agent: *\n')
    expect(body).toContain(
      'Content-Signal: search=yes, ai-input=yes, ai-train=yes',
    )
    for (const path of PRIVATE_PATHS) {
      expect(body).toContain(`Disallow: ${path}\n`)
    }
    expect(body).toContain('Sitemap: https://locatic.dev/sitemap.xml')
    // One group for every agent: a named group would replace these rules.
    expect(body.match(/User-agent:/g)).toHaveLength(1)
  })
})
```

**Step 2:** Run `pnpm vitest run src/lib/__tests__/robots.test.ts`. Expected: FAIL (module missing).

**Step 3: Implement `src/lib/robots.ts`**

```ts
import { SITE_URL } from '@/lib/seo'
import { isProductionHost } from '@/lib/security-headers'

/** Signed-in, auth and admin paths: nothing a search result should show. */
export const PRIVATE_PATHS = [
  '/home',
  '/inbox',
  '/notifications',
  '/saved',
  '/settings',
  '/profile',
  '/onboarding',
  '/admin',
  '/sign-in',
  '/sign-up',
]

/**
 * robots.txt for the requesting host. Production opens public pages to every
 * crawler (search, AI search, user fetchers and AI training: decision of
 * 2026-10-17) with one `*` group, because a named group would replace the
 * private-path rules for that agent. Other hosts block everything.
 * Content-Signal: https://contentsignals.org
 */
export function renderRobotsTxt(url: URL): string {
  if (!isProductionHost(url)) {
    return 'User-agent: *\nDisallow: /\n'
  }
  return [
    '# https://www.robotstxt.org/robotstxt.html',
    'User-agent: *',
    'Content-Signal: search=yes, ai-input=yes, ai-train=yes',
    ...PRIVATE_PATHS.map((path) => `Disallow: ${path}`),
    '',
    `Sitemap: ${SITE_URL}/sitemap.xml`,
    '',
  ].join('\n')
}
```

**Step 4: Implement `src/routes/robots[.]txt.ts`** (same pattern as `src/routes/sitemap[.]xml.ts`)

```ts
import { createFileRoute } from '@tanstack/react-router'
import { renderRobotsTxt } from '@/lib/robots'

export const Route = createFileRoute('/robots.txt')({
  server: {
    handlers: {
      GET: ({ request }) =>
        new Response(renderRobotsTxt(new URL(request.url)), {
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'public, max-age=3600',
          },
        }),
    },
  },
})
```

Delete `public/robots.txt`. Run `pnpm dev` once so the route tree regenerates.

**Step 5:** Run the unit test (PASS), then `curl -s http://localhost:3000/robots.txt`. Expected: `User-agent: *` / `Disallow: /` (localhost is not production).

**Step 6:** Add to `playwright/seo.public.spec.ts`:

```ts
test('robots.txt is served by the app and blocks non-production hosts', async ({
  request,
}) => {
  const response = await request.get('/robots.txt')
  expect(response.status()).toBe(200)
  expect(await response.text()).toBe('User-agent: *\nDisallow: /\n')
})
```

**Step 7: Commit:** `feat(seo): serve a host-aware robots.txt with an open AI crawler policy`

### Task A3: Strip default search params so canonical URLs never redirect

`/explore` 307s to `/explore?mode=projects&q=&scope=default&selectedCityIds=[]` and `/u/{user}` 307s to `?network=followers&tab=projects`, because `validateSearch` fills defaults and SSR redirects to the normalized href. `stripSearchParams` removes values deep-equal to the defaults when building locations, both for links and for that SSR check.

**Files:**

- Modify: `src/features/explore/state.ts` (export defaults), `src/routes/explore.tsx`
- Modify: `src/features/profile/state.ts` (export defaults), `src/routes/u.$username.tsx`
- Test: `src/features/explore/__tests__/state.test.ts`, `src/features/profile/__tests__/` (state test; create `state.test.ts` if none exists), `playwright/seo.public.spec.ts`

**Step 1: Write failing contract tests** that keep the defaults in sync with the normalizers

```ts
// explore
it('EXPLORE_SEARCH_DEFAULTS is what an empty URL normalizes to', () => {
  expect(normalizeExploreSearch({})).toMatchObject(EXPLORE_SEARCH_DEFAULTS)
})

// profile
it('PROFILE_SEARCH_DEFAULTS is what an empty URL normalizes to', () => {
  expect(normalizeProfileSearch({})).toEqual(PROFILE_SEARCH_DEFAULTS)
})
```

**Step 2:** Run both test files. Expected: FAIL (exports missing).

**Step 3: Implement**

```ts
// src/features/explore/state.ts
/** Values an unfiltered Explore URL leaves out; stripped from every link. */
export const EXPLORE_SEARCH_DEFAULTS = {
  mode: 'projects',
  q: '',
  scope: 'default',
  selectedCityIds: [],
} satisfies Partial<ExploreSearch>
```

```ts
// src/features/profile/state.ts
export const PROFILE_SEARCH_DEFAULTS = {
  network: 'followers',
  tab: 'projects',
} satisfies ProfileSearch
```

```ts
// src/routes/explore.tsx and src/routes/u.$username.tsx
import { stripSearchParams } from '@tanstack/react-router'
// …
  validateSearch: normalizeExploreSearch,
  // Default values stay out of URLs, so /explore is its own canonical URL
  // instead of redirecting to a parameterized copy of itself.
  search: { middlewares: [stripSearchParams(EXPLORE_SEARCH_DEFAULTS)] },
```

Check what `normalizeExploreLanguageFilter` and `normalizeExploreTopicFilter` return for an empty URL. If it's `undefined`, nothing more is needed (undefined keys are not serialized). If it's another sentinel, add it to `EXPLORE_SEARCH_DEFAULTS`.

**Step 4:** Run the unit tests (PASS). Then, with `pnpm dev` running:

```bash
for p in /explore /u/<public-persona-username>; do curl -s -o /dev/null -w "$p %{http_code} %{redirect_url}\n" http://localhost:3000$p; done
```

Expected: `200` with no redirect for both. Also confirm `curl -s http://localhost:3000/ | grep -o 'href="/explore[^"]*"'` prints `href="/explore"`.

**Step 5: Add e2e coverage** in `playwright/seo.public.spec.ts`:

```ts
for (const path of ['/explore', `/u/${PUBLIC_PERSONA_USERNAME}`]) {
  test(`${path} renders at its canonical URL`, async ({ request }) => {
    const response = await request.get(path, { maxRedirects: 0 })
    expect(response.status()).toBe(200)
    expect(await response.text()).toContain(
      `<link rel="canonical" href="https://locatic.dev${path}"/>`,
    )
  })
}
```

**Step 6:** Run existing Explore and profile tests: `pnpm vitest run src/features/explore src/features/profile`. Expected: PASS. Filtered states such as `?mode=builders` must still round-trip.

**Step 7: Commit:** `fix(seo): keep default search params out of Explore and profile URLs`

### Task A4: Link cities by slug, and make the id fallback permanent

City pills link to `/c/{cityId}`, which 307s to the slug. Add the slug to the disclosure that already carries the id.

**Files:**

- Modify: `convex/lib/visibility.ts` (`DisclosureCity` adds `'slug'`; the `city` variant of `LocationDisclosure` adds `citySlug: string`; `SnapshotLocation` adds optional `citySlug?: string | null`; `resolveLocationDisclosure` and `toSnapshotLocation` pass it through)
- Modify: `convex/lib/validators.ts:270-284` (`citySlug: v.string()` on the city variant)
- Modify: `convex/lib/project_previews.ts` (wherever card signals expose `cityId`, expose `citySlug` beside it)
- Modify: `src/components/ui/city-pill.tsx` (new `citySlug?: string | null` prop; link `params={{ slug: citySlug ?? cityId }}`), plus callers in `project-card.tsx`, `person-row.tsx`, `project-owner-card.tsx`, `comment-thread.tsx`, `home-feed-card.tsx`, `explore-rail.tsx`
- Modify: `src/routes/c.$slug.tsx` (`redirect({ …, statusCode: 301 })` for the id → slug redirect)
- Test: `convex/lib/__tests__/visibility.test.ts`, `src/components/ui/__tests__/city-pill.test.tsx`

**Step 1: Failing tests**

- `visibility.test.ts`: an `exact_city` user's disclosure equals `{ kind: 'city', cityId, cityName, citySlug: city.slug, regionLabel }`. Region-only and hidden disclosures still carry no slug.
- `city-pill.test.tsx`: given `citySlug="bengaluru-in"` the link `href` is `/c/bengaluru-in`; with only `cityId` it falls back to `/c/{id}`.

**Step 2:** Run both. Expected: FAIL.

**Step 3: Implement** the changes listed above. Disclosures are computed at read time, so the required field needs no migration. Stored snapshots (home feed rows, post actor snapshots) predate `citySlug`, so it stays optional there and the pill falls back to the id.

**Step 4:** `pnpm typecheck` will list every producer and consumer. Fix each one, then run `pnpm vitest run convex/lib/__tests__/visibility.test.ts src/components/ui/__tests__/city-pill.test.tsx convex/cities.test.ts`. Expected: PASS.

**Step 5:** Check that SSR HTML of a city, profile and project page has no `href="/c/j9…"` (id-shaped) links for live disclosures: `curl -s http://localhost:3000/c/<slug> | grep -oE 'href="/c/[^"]+"' | sort -u`.

**Step 6: Commit:** `fix(seo): link cities by slug and redirect id URLs permanently`

### Task A5: Give project pages real internal links

The owner card is a `<button onClick={navigate}>` (`src/features/projects/project-owner-card.tsx:143`), and "more from {city}" and the owner's city load only on the client.

**Files:**

- Modify: `src/features/projects/project-owner-card.tsx:141-166`
- Modify: `src/routes/_app/project.$owner.$repo.tsx` loader
- Test: `playwright/seo.public.spec.ts`

**Step 1: Failing e2e test**

```ts
test('a project page links to its builder and city in server HTML', async ({
  request,
}) => {
  const html = await (await request.get(PUBLIC_PROJECT_PATH)).text()
  expect(html).toContain(`href="/u/${PUBLIC_PERSONA_USERNAME}"`)
  expect(html).toMatch(/href="\/c\/[a-z0-9-]+"/)
})
```

**Step 2:** Run `pnpm e2e --project=chromium-public playwright/seo.public.spec.ts`. Expected: FAIL.

**Step 3: Implement**

- Replace the button with `<Link to="/u/$username" params={{ username: detail.owner.githubUsername }} className={…same classes…}>`. Remove `useRouter` if nothing else uses it. A link is also the correct element for navigation (a11y).
- In the loader, replace `void context.queryClient.prefetchQuery(projectSignalsQueryOptions(…))` with:

```ts
// Rendered on the server so crawlers see the owner's city and the
// "more from {city}" links. prefetchQuery never throws: a failure leaves
// both to load on the client.
await Promise.all([
  context.queryClient.prefetchQuery(
    projectSignalsQueryOptions(detail.project._id),
  ),
  context.queryClient.prefetchQuery(
    moreFromOwnerCityQueryOptions(detail.project._id),
  ),
])
```

Update the "not worth blocking on" comment accordingly.

**Step 4:** Run the e2e test (PASS) and `pnpm vitest run src/features/projects`. Expected: PASS.

**Step 5: Commit:** `fix(seo): link project pages to their builder and city on the server`

### Task A6: Server-render Explore's first page for visitors

Signed-out `/explore` currently renders about 37 words and no project links, because the feed uses Convex `usePaginatedQuery`, which doesn't run on the server.

**Files:**

- Modify: `src/routes/explore.tsx` (visitor branch of the loader, around line 77)
- Modify: `src/features/explore/explore-page.tsx` (around lines 320–420, where `publicProjectsPaged`, `publicBuildersPaged` and `publicPostsPaged` are built)
- Possibly create: `src/features/explore/first-page.ts` (query options for the first page)
- Test: `src/features/explore/components/__tests__/explore-feed.test.tsx`, `playwright/seo.public.spec.ts`

**Design:** For a visitor, the loader prefetches one TanStack Query of the same Convex paginated function the active mode uses, with the same args and `paginationOpts: { numItems: <the hook's initialNumItems>, cursor: null }`. While `usePaginatedQuery` reports `status === 'LoadingFirstPage'`, the feed renders that prefetched page. Server and first client render both show it, so hydration matches; once the live first page arrives it replaces the prefetched one.

**Step 1: Failing tests**

- Unit: when the paginated status is `LoadingFirstPage` and first-page data exists, the feed renders those items instead of the skeleton.
- E2E: `await (await request.get('/explore')).text()` contains at least one `href="/project/`.

**Step 2:** Run both. Expected: FAIL.

**Step 3: Implement** the design. Reuse the args builder the hook already uses, so the two can't drift. Only the active mode is prefetched.

**Step 4:** Run tests (PASS). Check in the browser that scrolling past the first page still paginates and nothing is duplicated.

**Step 5: Commit:** `feat(seo): server-render the first page of Explore for visitors`

### Task A7: GitHub org link and founder name

**Files:**

- Modify: `src/lib/site-links.ts`, `src/routes/index.tsx:73`, `src/features/landing/about-dialog.tsx` (moved into the shared letter in Task B3)
- Test: `src/features/landing/__tests__/about-dialog.test.tsx`

**Step 1: Failing tests:** the dialog shows "Avinash Changrani", and the GitHub button links to `https://github.com/locatic-dev`.

**Step 2: Implement**

```ts
// src/lib/site-links.ts
/**
 * Locatic on GitHub. The organisation page until the app repository is
 * public; then point this at https://github.com/locatic-dev/locatic.
 */
export const GITHUB_URL = 'https://github.com/locatic-dev'
```

Rename the import at every call site. Change the dialog button copy from "star locatic on github" to "follow locatic on github", and the "Help us grow" copy from "star the repo" to "follow us on GitHub". Fix the founder spelling.

**Step 3:** Run the tests (PASS). `grep -rn "locatic-dev/locatic" src` must print nothing.

**Step 4: Commit:** `fix(landing): link the GitHub organisation and fix a founder's name`

---

## Phase B — On-page content

### Task B1: Titles, descriptions and the profile Open Graph type

**Files:**

- Modify: `src/lib/seo.ts`, `src/routes/explore.tsx`, `src/routes/c.$slug.tsx`, `src/routes/u.$username.tsx`
- Test: `src/lib/__tests__/seo.test.ts`

**Step 1: Failing tests**

```ts
it('leads the default title with what Locatic is for', () => {
  expect(DEFAULT_TITLE).toBe(
    'Locatic: find developers and projects in your city',
  )
  expect(DEFAULT_DESCRIPTION.length).toBeLessThanOrEqual(160)
  expect(DEFAULT_DESCRIPTION).toMatch(
    /^Locatic is a social network for developers/,
  )
})

it('marks profiles with og:type profile', () => {
  const { meta } = seo({
    title: 'x',
    path: '/u/x',
    type: 'profile',
    username: 'x',
  })
  expect(metaContent(meta, 'og:type')).toBe('profile')
  expect(metaContent(meta, 'profile:username')).toBe('x')
})
```

**Step 2:** Run the test file. Expected: FAIL.

**Step 3: Implement**

```ts
export const DEFAULT_TITLE =
  'Locatic: find developers and projects in your city'
export const DEFAULT_DESCRIPTION =
  'Locatic is a social network for developers that shows what people are building in each city. Discover projects, follow builders, talk to them.'
```

Add `type?: 'website' | 'profile'` (default `'website'`) and `username?: string` to `SeoOptions`. Emit `profile:username` only when `type === 'profile'`. Then:

- Explore: `title: 'Explore developer projects by city'`.
- City: `title: \`Developers and projects in ${loaderData.name}\``.
- Profile: pass `type: 'profile', username: loaderData.githubUsername`.

Update the existing tests that assert the old default title.

**Step 4:** Run the seo tests plus the route head tests: `pnpm vitest run src/lib src/routes`. Expected: PASS.

**Step 5: Commit:** `feat(seo): lead titles with what Locatic is for`

### Task B2: Thin-page rules (`noindex, follow` and sitemap filter)

**Files:**

- Create: `convex/lib/seo_thresholds.ts`, `convex/lib/__tests__/seo_thresholds.test.ts`
- Modify: `src/lib/seo.ts` (new `thin` option), `src/routes/c.$slug.tsx`, `src/routes/u.$username.tsx`, `convex/sitemap.ts`, `convex/sitemap.test.ts`, `src/lib/__tests__/seo.test.ts`

**Step 1: Write the thresholds module test first**

```ts
import { describe, expect, it } from 'vitest'
import { isCityIndexable, isProfileIndexable } from '../seo_thresholds'

describe('seo thresholds', () => {
  it('indexes cities from three counted builders', () => {
    expect(isCityIndexable({ builderCount: 2 })).toBe(false)
    expect(isCityIndexable({ builderCount: 3 })).toBe(true)
  })
  it('indexes profiles with at least one visible project', () => {
    expect(isProfileIndexable({ projectsCount: 0 })).toBe(false)
    expect(isProfileIndexable({ projectsCount: 1 })).toBe(true)
  })
})
```

**Step 2: Implement `convex/lib/seo_thresholds.ts`** (shared by the sitemap queries and the route heads; `src/` already imports `convex/lib` constants by relative path)

```ts
// Thin-page rules (decision of 2026-10-17). Below these sizes a public page
// still works for people and its links are still followed, but it is kept
// out of search indexes and the sitemap so thin pages don't weigh on the
// whole site.

/** Counted builders (exact-city, discoverable) a city page needs. */
export const INDEXABLE_CITY_MIN_BUILDERS = 3

/** Visible projects a profile needs. */
export const INDEXABLE_PROFILE_MIN_PROJECTS = 1

export function isCityIndexable(stats: { builderCount: number }): boolean {
  return stats.builderCount >= INDEXABLE_CITY_MIN_BUILDERS
}

export function isProfileIndexable(stats: { projectsCount: number }): boolean {
  return stats.projectsCount >= INDEXABLE_PROFILE_MIN_PROJECTS
}
```

Before relying on it, confirm `users.stats.projectsCount` counts visible projects only (see the visibility toggle in `convex/projects.ts` around lines 815–845). If it doesn't, count `pinnedProjects` plus `recentProjects` in the route, and add a dedicated counter for the sitemap.

**Step 3: `thin` option in `seo()`** (test first)

```ts
it('keeps thin pages out of the index but follows their links', () => {
  const { meta, links } = seo({ title: 'x', path: '/c/x', thin: true })
  expect(meta).toContainEqual({ name: 'robots', content: 'noindex, follow' })
  expect(metaContent(meta, 'og:title')).toBe('x · Locatic') // previews still work
  expect(links).toEqual([]) // no canonical on a noindex page
})
```

Implement: build the normal tags, append `{ name: 'robots', content: 'noindex, follow' }`, and return `links: []`. Document that `noindex` is for private pages and `thin` for public pages too small to index.

**Step 4: Wire the routes**

- City loader returns `builderCount: page.stats.builderCount`, and the head passes `thin: !isCityIndexable(loaderData)`.
- Profile head passes `thin: !isProfileIndexable(loaderData.stats)`.

**Step 5: Sitemap filters** (extend `convex/sitemap.test.ts` first): a city with 2 builders and a profile with 0 projects are excluded; a city with 3 builders and a profile with 1 project are included. Then filter in `convex/sitemap.ts` (`cities`: `isCityIndexable({ builderCount })`; `profiles`: `isProfileIndexable(user.stats)`).

**Step 6:** `pnpm vitest run convex/lib/__tests__/seo_thresholds.test.ts convex/sitemap.test.ts src/lib/__tests__/seo.test.ts`. Expected: PASS.

**Step 7: Commit:** `feat(seo): keep thin city and profile pages out of the index`

### Task B3: `/about` page with a shared letter and FAQ

**Files:**

- Create: `src/features/about/about-content.ts`, `src/features/about/about-letter.tsx`, `src/features/about/about-faq.tsx`, `src/routes/about.tsx`
- Create: `src/features/about/__tests__/about-content.test.ts`, `src/features/about/__tests__/about-page.test.tsx`
- Modify: `src/features/landing/about-dialog.tsx` (renders `<AboutLetter />`), `src/routes/index.tsx` (nav "about" becomes `<Link to="/about">`), `src/components/app-shell/public-footer.tsx` (add "about"), `src/lib/sitemap.ts` (`STATIC_SITEMAP_PATHS` adds `'/about'`), `src/lib/__tests__/sitemap.test.ts`, `src/features/landing/__tests__/about-dialog.test.tsx`

**Content module** (owner reviews the copy before merge):

```ts
// src/features/about/about-content.ts
// One source for what Locatic is. The landing page, /about, the in-app
// dialog, JSON-LD and llms.txt all reuse this wording, so search engines and
// AI answers see the same definition everywhere.

export const LOCATIC_DEFINITION =
  'Locatic is a social network for developers that shows what people are building in each city. Builders sign in with GitHub, pick their city and the public repositories they want to show; anyone can browse projects, builders and posts by city or across the world, and members can follow, comment and message each other.'

export const CONTACT_EMAIL = 'contact@locatic.dev'

export const FOUNDERS = [
  { name: 'Saketha Rama', github: 'bv-saketha-rama' },
  { name: 'Avinash Changrani', github: 'nabobery' },
] as const

export const ABOUT_FAQ = [
  {
    question: 'What is Locatic?',
    answer: LOCATIC_DEFINITION,
  },
  {
    question: 'Can I browse Locatic without an account?',
    answer:
      'Yes. Explore, city pages, public profiles and project pages are open to everyone. You need an account to follow builders, like, comment, save projects or send messages.',
  },
  {
    question: 'How does Locatic use my GitHub account?',
    answer:
      'You sign in with GitHub. Locatic shows only the public repositories you choose to import, with their README, languages, topics and releases. It does not post to GitHub for you.',
  },
  {
    question: 'What does Locatic show about my location?',
    answer:
      'You choose: your exact city, only your region or country, or nothing. The server applies that choice to every public page, count and map dot. Builders who hide their location are left out of city lists and counts.',
  },
  {
    question: 'How is Locatic different from GitHub?',
    answer:
      'GitHub hosts code. Locatic is about the people behind it: who is building what, and where. It sits on top of your public GitHub work and adds city pages, follows, comments and direct messages. There are no rankings or leaderboards: builders are ordered by their most recent public work.',
  },
  {
    question: 'My city is not listed. Can I still join?',
    answer:
      'Yes. Choose "can\'t find my city" during onboarding and you keep global discovery; you join a city\'s page once you set one.',
  },
] as const
```

Verify every FAQ claim against the product before shipping. In particular: that only public repos can be imported, that Locatic never writes to GitHub, and the onboarding copy for an unlisted city.

**Steps (TDD):**

1. `about-content.test.ts`: `LOCATIC_DEFINITION` is 40–80 words and starts with "Locatic is"; every FAQ answer is under 90 words; founders' names match the spelling decision.
2. `about-page.test.tsx`: the page renders one `h1` ("about locatic"), the definition as the first paragraph, one `h2` per letter section and per FAQ question (as `h3`s under an `h2` "questions"), and founder links to `https://github.com/<login>`.
3. Run both. Expected: FAIL.
4. Move the letter body from `about-dialog.tsx` into `about-letter.tsx` with a `headingLevel` prop: `h3` inside the dialog, `h2` on the page. Remove the dialog's sign-up-specific opener ("Thanks for signing up…") from the shared copy; keep it as a dialog-only line, because `/about` readers haven't signed up.
5. `src/routes/about.tsx`: `PublicHeader` + `<main id="main-content" tabIndex={-1}>` + `h1` + definition paragraph + `<AboutLetter headingLevel="h2" />` + `<AboutFaq />` + `PublicFooter`. Head: `seo({ title: 'About', description: truncateDescription(LOCATIC_DEFINITION), path: '/about' })` (JSON-LD is added in Task C2).
6. Landing nav: replace the `AboutDialog` trigger with `<Button asChild variant="ghost" size="touch"><Link to="/about">about</Link></Button>`. The sidebar keeps the dialog.
7. Run the unit tests, then `pnpm e2e --project=chromium-public playwright/axe.public.spec.ts` after adding `/about` to the axe and overflow sweeps (`playwright/axe.public.spec.ts`, `playwright/landing.public.spec.ts`). Expected: PASS, no axe violations, no horizontal overflow at the 8 sweep widths.
8. Update `playwright/visual.public.spec.ts` with an `about` snapshot at 1440 and 390 (`--update-snapshots` for the new ones only).

**Commit:** `feat(about): add a public about page with the founders' letter and FAQ`

### Task B4: A "what is locatic" block on the landing page

**Files:**

- Modify: `src/routes/index.tsx` (after `<FeatureRow />`)
- Test: `src/features/landing/__tests__/landing-content.test.tsx` (or a new `landing-about.test.tsx`)

**Steps:**

1. Failing test: the landing renders an `h2` "what is locatic?", a paragraph whose text equals `LOCATIC_DEFINITION`, and a link to `/about`.
2. Implement a small `<section aria-labelledby="what-is-locatic">` with the `h2`, the definition and `<Link to="/about">read more about locatic →</Link>`, using the same max width and gutter as `FeatureRow`.
3. Run the test, the landing overflow sweep and the visual specs (update only the landing snapshots).

**Commit:** `feat(landing): define Locatic in plain words below the features`

### Task B5: A data-backed summary on city pages

**Files:**

- Create: `src/features/city/city-summary.ts`, `src/features/city/__tests__/city-summary.test.ts`
- Modify: `src/features/city/city-sections.tsx` (render under the header), `src/routes/c.$slug.tsx` (use the summary as the description when indexable)

**Rules:** describe, never rank. Name no builder; no "top", "best" or numbered positions (product principle 7).

**Step 1: Failing tests**

```ts
it('describes builders, projects and recent languages', () => {
  expect(
    describeCity({
      name: 'Bengaluru',
      stats: {
        builderCount: 12,
        projectCount: 34,
        lastActivityAt: Date.UTC(2026, 9, 15),
      },
      recentLanguages: [
        'TypeScript',
        'Go',
        'TypeScript',
        'Python',
        'Go',
        'TypeScript',
      ],
    }),
  ).toBe(
    '12 builders in Bengaluru share 34 public projects on Locatic. Recent work is mostly TypeScript, Go and Python. Last activity: Oct 15, 2026.',
  )
})

it('uses singular forms and skips languages when there are none', () => {
  expect(
    describeCity({
      name: 'Kolkata',
      stats: { builderCount: 1, projectCount: 1, lastActivityAt: null },
      recentLanguages: [],
    }),
  ).toBe('1 builder in Kolkata shares 1 public project on Locatic.')
})
```

**Step 2: Implement** a pure function. Count primary languages from `page.recentWork` (the largest entry of each card's `languages` by bytes), take the top 3 by count (ties by name), and format the date with the existing UTC formatter (`src/lib/format.ts`, covered by `format-date-utc.test.ts`) so SSR and client agree.

**Step 3:** Render it as `<p>` under the city header, and use it (truncated) as the meta description when `isCityIndexable`.

**Step 4:** Run `pnpm vitest run src/features/city`. Expected: PASS.

**Commit:** `feat(city): summarise each city's builders, projects and languages`

### Task B6: Drop contribution-graph noise from server HTML

Each profile ships 365 `<title>` elements ("N contributions on {date}"), about 2,000 words of noise for extractors. The SVG is `role="img"` with an `aria-label`, so these titles only serve as mouse tooltips.

**Files:**

- Modify: `src/components/ui/contribution-graph.tsx:208-221`
- Test: `src/components/ui/__tests__/contribution-graph.test.tsx`

**Steps:**

1. Failing test: `renderToString(<ContributionGraph … />)` contains no "contributions on"; after a client render (RTL `render`), cells have `<title>`s.
2. Add a hydration flag (`useSyncExternalStore(() => () => {}, () => true, () => false)`, or reuse an existing helper in `src/lib` if one fits) and render `<title>` only once hydrated. Update the "per-day counts are in each cell's title" comment.
3. Run the test. Expected: PASS.

**Commit:** `perf(profile): render contribution tooltips after hydration`

---

## Phase C — Structured data (JSON-LD)

### Task C1: JSON-LD helper and head plumbing

**Files:**

- Create: `src/lib/structured-data.ts`, `src/lib/__tests__/structured-data.test.ts`

**Step 1: Failing tests**

```ts
it('escapes markup so user text cannot close the script tag', () => {
  const script = jsonLdScript({ '@type': 'Thing', name: '</script><b>' })
  expect(script.type).toBe('application/ld+json')
  expect(script.children).not.toContain('</script>')
  expect(JSON.parse(script.children)).toEqual({
    '@context': 'https://schema.org',
    '@type': 'Thing',
    name: '</script><b>',
  })
})
```

**Step 2: Implement**

```ts
import { SITE_URL } from '@/lib/seo'

type JsonLdNode = { '@type': string } & Record<string, unknown>

export const ORGANIZATION_ID = `${SITE_URL}/#organization`
export const WEBSITE_ID = `${SITE_URL}/#website`

/**
 * A `<script type="application/ld+json">` for a route's `head().scripts`.
 * Values include user-written text (bios, repository descriptions), so `<`,
 * `>` and `&` are escaped: the JSON stays identical, and no value can end
 * the script element.
 */
export function jsonLdScript(nodes: JsonLdNode | JsonLdNode[]) {
  const data = Array.isArray(nodes)
    ? { '@context': 'https://schema.org', '@graph': nodes }
    : { '@context': 'https://schema.org', ...nodes }
  return {
    type: 'application/ld+json',
    children: JSON.stringify(data)
      .replace(/</g, '\\u003c')
      .replace(/>/g, '\\u003e')
      .replace(/&/g, '\\u0026'),
  }
}
```

**Step 3:** Prove the plumbing renders on the server. On `/` only, set `head: () => ({ ...seo({ path: '/' }), scripts: [jsonLdScript({ '@type': 'WebSite', name: 'Locatic', url: SITE_URL })] })`. Then `curl -s http://localhost:3000/ | grep -c 'application/ld+json'` must print 1, inside `<head>`. If TanStack's `head().scripts` doesn't render through `<HeadContent />` in this version, check the docs (`npx ctx7@latest` for `@tanstack/react-router` head scripts) and use the documented alternative before continuing.

**Commit:** `feat(seo): add a JSON-LD helper for route heads`

### Task C2: Organization, WebSite and AboutPage

**Files:** `src/lib/structured-data.ts` (builders), `src/routes/index.tsx`, `src/routes/about.tsx`, tests.

```ts
export function organizationNode(): JsonLdNode {
  return {
    '@type': 'Organization',
    '@id': ORGANIZATION_ID,
    name: 'Locatic',
    url: SITE_URL,
    logo: `${SITE_URL}/icon-512.png`,
    description: LOCATIC_DEFINITION,
    email: CONTACT_EMAIL,
    sameAs: [GITHUB_URL],
    founder: FOUNDERS.map((founder) => ({
      '@type': 'Person',
      name: founder.name,
      sameAs: `https://github.com/${founder.github}`,
    })),
  }
}

export function websiteNode(): JsonLdNode {
  return {
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    name: 'Locatic',
    url: SITE_URL,
    publisher: { '@id': ORGANIZATION_ID },
  }
}
```

`/` gets `[organizationNode(), websiteNode()]`. `/about` gets `[organizationNode(), { '@type': 'AboutPage', url: \`${SITE_URL}/about\`, mainEntity: { '@id': ORGANIZATION_ID } }]`. Test the node shapes; e2e: both pages' HTML parses to JSON with the expected `@type`s. Add more `sameAs` profiles (X, LinkedIn) only once they exist.

**Commit:** `feat(seo): describe Locatic as an organization in JSON-LD`

### Task C3: ProfilePage + Person on `/u/{username}`

**Privacy rule:** build only from `publicProfileOverview`, which is already filtered. Location: `kind: 'city'` → `homeLocation: { '@type': 'Place', name: cityName }`; `kind: 'region'` → `{ '@type': 'Place', name: regionLabel }`; `kind: 'none'` → omit. Never read the raw user document.

```ts
export function profilePageNode(overview: PublicProfileOverview): JsonLdNode {
  const url = `${SITE_URL}/u/${overview.githubUsername}`
  const location = overview.profile.location
  return {
    '@type': 'ProfilePage',
    url,
    mainEntity: {
      '@type': 'Person',
      '@id': `${url}#person`,
      name: overview.profile.displayName,
      alternateName: `@${overview.githubUsername}`,
      identifier: overview.githubUsername,
      ...(overview.profile.bio ? { description: overview.profile.bio } : {}),
      ...(overview.profile.avatarUrl
        ? { image: overview.profile.avatarUrl }
        : {}),
      sameAs: [
        `https://github.com/${overview.githubUsername}`,
        ...publicSocialUrls(overview.profile.socialLinks), // reuse src/lib/social-links.ts
      ],
      ...(location.kind === 'city'
        ? { homeLocation: { '@type': 'Place', name: location.cityName } }
        : location.kind === 'region'
          ? { homeLocation: { '@type': 'Place', name: location.regionLabel } }
          : {}),
      interactionStatistic: {
        '@type': 'InteractionCounter',
        interactionType: 'https://schema.org/FollowAction',
        userInteractionCount: overview.stats.followersCount,
      },
    },
  }
}
```

**Tests (write first):** an exact-city user has `homeLocation.name` equal to the city; region-only has the region label; hidden has no `homeLocation`; a bio containing `</script>` stays escaped (via `jsonLdScript`). Emit only when the profile is indexable (`!thin`).

**Commit:** `feat(seo): add ProfilePage structured data to public profiles`

### Task C4: SoftwareSourceCode + BreadcrumbList on project pages

The project loader returns only `fullName`, `description`, `ownerName` and `path`. Extend its return with the fields below, taken from the already-loaded `detail`: `name`, `topics`, `primaryLanguage` (largest of `github.languages`), `updatedAt`/`pushedAt`, `ownerUsername`, `ownerProfileIsPublic` (find it in the detail payload; if it isn't there, link the author by GitHub only), and the owner's disclosed city name and slug from the signals prefetched in Task A5.

```ts
export function projectNodes(project: ProjectSeoData): JsonLdNode[] {
  const url = `${SITE_URL}/project/${project.owner}/${project.name}`
  const author = project.ownerProfileIsPublic
    ? {
        '@id': `${SITE_URL}/u/${project.ownerUsername}#person`,
        '@type': 'Person',
        name: project.ownerName,
      }
    : {
        '@type': 'Person',
        name: project.ownerName,
        sameAs: `https://github.com/${project.ownerUsername}`,
      }
  return [
    {
      '@type': 'SoftwareSourceCode',
      name: project.name,
      url,
      codeRepository: `https://github.com/${project.fullName}`,
      ...(project.description ? { description: project.description } : {}),
      ...(project.primaryLanguage
        ? { programmingLanguage: project.primaryLanguage }
        : {}),
      ...(project.topics.length ? { keywords: project.topics.join(', ') } : {}),
      ...(project.updatedAt
        ? { dateModified: new Date(project.updatedAt).toISOString() }
        : {}),
      author,
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { name: 'Locatic', item: SITE_URL },
        ...(project.city
          ? [
              {
                name: project.city.name,
                item: `${SITE_URL}/c/${project.city.slug}`,
              },
            ]
          : []),
        { name: project.fullName, item: url },
      ].map((crumb, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        ...crumb,
      })),
    },
  ]
}
```

**Tests first:** a city crumb appears only for exact-city owners; a members-only owner gets no `/u/` reference; topics become keywords.

**Commit:** `feat(seo): add SoftwareSourceCode and breadcrumbs to project pages`

### Task C5: CollectionPage + ItemList on indexable city pages

The city loader returns `projects: page.recentWork.map(({ fullName, ownerLogin, name }) => …)` (field names per the city page validator) and the place coordinates. Emit only when `isCityIndexable`.

```ts
export function cityPageNode(city: CitySeoData): JsonLdNode {
  const url = `${SITE_URL}/c/${city.slug}`
  return {
    '@type': 'CollectionPage',
    name: `Developers and projects in ${city.name}`,
    url,
    about: {
      '@type': 'Place',
      name: city.displayName,
      geo: {
        '@type': 'GeoCoordinates',
        latitude: city.location.lat,
        longitude: city.location.lng,
      },
    },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: city.projects.length,
      itemListElement: city.projects.map((project, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: `${SITE_URL}/project/${project.owner}/${project.name}`,
        name: project.fullName,
      })),
    },
  }
}
```

City coordinates are already public (landing and city maps), so they disclose nothing new.

**Verify phase C:** paste the dev-server HTML (or later, the `development.locatic.dev` URLs) of `/`, `/about`, a profile, a project and an indexable city into https://search.google.com/test/rich-results and https://validator.schema.org. Expected: no errors. Warnings about optional fields are acceptable.

**Commit:** `feat(seo): add CollectionPage structured data to city pages`

---

## Phase D — Discovery files and performance

### Task D1: Sitemap additions

**Files:** `convex/cities.ts` (`readActiveMapCities` rows gain `lastActivityAt`; `listActiveForMap` maps it out so its public validator stays unchanged), `convex/sitemap.ts` (city `updatedAt: city.lastActivityAt`), `convex/sitemap.test.ts`, `convex/cities.test.ts`.

Tests first: city entries carry `lastmod` from `stats.lastActivityAt`; `listActiveForMap` output is unchanged. `/about` was added in Task B3.

**Commit:** `feat(seo): date city entries in the sitemap`

### Task D2: `llms.txt`

**Files:** Create `public/llms.txt`; modify `public/_headers` (`/llms.txt` → `Cache-Control: public, max-age=86400`); add a Playwright check that it returns 200 `text/plain` and links `/about`.

```markdown
# Locatic

> Locatic is a social network for developers that shows what people are building in each city. Builders sign in with GitHub and show their public projects; anyone can browse projects, builders and posts by city or across the world.

## Start here

- [About Locatic](https://locatic.dev/about): what Locatic is, who builds it, frequently asked questions
- [Explore](https://locatic.dev/explore): public projects, builders and posts, everywhere or by city
- [Sitemap](https://locatic.dev/sitemap.xml): every indexed city, builder and project page

## Page types

- City pages: https://locatic.dev/c/{city-slug} — builders, recent projects and posts in one city
- Builder profiles: https://locatic.dev/u/{github-username}
- Project pages: https://locatic.dev/project/{github-owner}/{repo}

## Policies

- [Privacy](https://locatic.dev/privacy)
- [Terms](https://locatic.dev/terms)
```

Add a unit test that the first `>` line equals `LOCATIC_DEFINITION`'s first sentence (read the file with `fs`), so the definition can't drift.

**Commit:** `feat(seo): publish llms.txt`

### Task D3: Edge cache for signed-out HTML

**Files:**

- Create: `src/lib/edge-cache.ts`, `src/lib/__tests__/edge-cache.test.ts`, `src/server.ts`
- Modify: `wrangler.jsonc` (`"main": "./src/server.ts"`; deployment config change, approved as part of this release)

**Design:**

- **Eligible request:** `GET`, no query string, path matches `^/(about|explore|privacy|terms|c/[^/]+|u/[^/]+|project/[^/]+/[^/]+)?$`, and no Clerk session: no `__session` cookie, `__client_uat` absent or `0`, no `__clerk_db_jwt`.
- **Eligible response:** status 200, `text/html`, no `Set-Cookie`, and `x-clerk-auth-status` absent or `signed-out`.
- **Storage:** `caches.default`, keyed by URL. Store with `Cache-Control: public, max-age=600` plus an `x-locatic-cached-at` header.
- **Serving:** if the stored copy is under 60 s old, serve it. If it's 60–600 s old, serve it and refresh in the background with `waitUntil` from `cloudflare:workers`. Otherwise, render.
- **Browser headers are unchanged:** the copy sent to the browser keeps the app's own `Cache-Control`; only the edge copy carries `max-age=600`. Strip `x-locatic-cached-at` before responding.
- **Off switch:** skip entirely when `globalThis.caches` is undefined (Vitest, local Node).

Before writing `src/server.ts`, look up the current TanStack Start custom server entry API (`npx ctx7@latest` for "@tanstack/react-start server entry cloudflare"). Expected shape:

```ts
import handler, { createServerEntry } from '@tanstack/react-start/server-entry'
import { withEdgeCache } from '@/lib/edge-cache'

export default createServerEntry({
  fetch: (request) => withEdgeCache(request, (req) => handler.fetch(req)),
})
```

**Tests (pure functions, write first):**

- `isCacheableRequest`: true for `/c/bengaluru-in` with no cookies; false with `__session=…`, with `__client_uat=1699999999`, for `POST`, for `/explore?mode=builders`, for `/home`, for `/_serverFn/…`.
- `isCacheableResponse`: false with `Set-Cookie`, for a 307, for `application/json`, and for `x-clerk-auth-status: signed-in`.
- `cacheDecision(ageSeconds)`: `fresh` under 60, `stale` from 60 to 600, `miss` above.

**Verify:** `pnpm ci:build` (bundle budget unchanged); deploy to development (Phase E); `curl -s -o /dev/null -w '%{time_starttransfer}\n'` three times on a city page. Expected: the second and third are under 0.2 s. Repeat the check with a signed-in browser's cookies and confirm the response is personalised (the member shell), never the cached visitor page.

**Commit:** `perf(edge): cache signed-out public pages at the edge`

### Task D4: Per-page Open Graph images (rendered in Convex, streamed by the Worker)

Rendering in the Worker is impossible on the free plan (10 ms CPU, 3 MB script). Render ahead of time in a Convex Node action and store the PNG in Convex file storage.

**Files:**

- Modify: `convex/schema.ts` (new table `og_images: { key: string, storageId: v.id('_storage'), contentHash: string, renderedAt: number }` with index `by_key`)
- Create: `convex/ogImages.ts` (queries/mutations: public `imageUrl({ key })`, internal `upsert`, internal `cardData({ key })` built from the same public read helpers as the pages), `convex/ogRender.ts` (`'use node'`; internal action `render({ key })` using satori + `@resvg/resvg-js`), `convex/lib/og_card.ts` (pure: card model from public data, content hash), tests for both lib files and `convex/ogImages.test.ts`
- Modify: `convex/crons.ts` (every 30 minutes: `ogImages.refreshStale` schedules renders for a bounded batch of indexable projects, profiles and cities whose `contentHash` changed or that have no image)
- Modify: `convex.json` (`node.externalPackages: ["@resvg/resvg-js"]` so the native binary installs on Convex instead of being bundled)
- Create: `src/routes/og.$kind.$.ts` (server route: `GET /og/{project|user|city}/{key}.png` → `imageUrl`; when null, 302 to `/og-image.png`; otherwise fetch and stream with `Cache-Control: public, max-age=86400`, stored in `caches.default`)
- Modify: `src/lib/seo.ts` (`image?: { url: string; alt: string }` option, defaulting to `SOCIAL_IMAGE`), the project, profile and city route heads
- Fonts: add Geist TTFs (satori doesn't read woff2) under `convex/assets/` or fetch them once per action run from the site; follow `public/fonts/OFL.txt` licensing.

**Card content (privacy):** project card shows repo name, description (truncated), primary language and topics, owner display name, and the owner's city only for an exact-city disclosure. Profile card shows name, @username, region or city per disclosure, and project count. City card shows city name, builder and project counts, and the top languages from Task B5. Members-only profiles and thin pages get no card (their heads keep the default image).

**Steps:**

1. Spike first: deploy `convex/ogRender.ts` to the development Convex deployment and render one fixed card. Gate: render time under 2 s and the deploy succeeds with `externalPackages`. If `@resvg/resvg-js` won't install, switch to `@resvg/resvg-wasm` with the wasm file loaded from the package path. Record the result in this plan.
2. TDD the pure pieces: `cardModel(publicPayload)` (privacy cases as above), `contentHash(card)` (stable and order-independent), and the route's key parsing (`/og/project/a/b.png` → `project:a/b`; rejects `..`, extra segments and other extensions).
3. Implement the queries, mutations, action, cron and route. Delete the previous storage object when a new render replaces it.
4. Verify: on development, open the project, profile and city URLs in the X and LinkedIn post inspectors (and https://www.opengraph.xyz). Expected: the per-page card, 1200×630.

**Commit:** `feat(og): render per-page Open Graph cards in Convex`

---

## Phase E — Verify on development, then go live

### Task E1: Live SEO check script

**Files:** Create `scripts/check-seo-live.mjs`; add `"seo:check": "node scripts/check-seo-live.mjs"` to `package.json`.

The script takes a base URL and a mode (`production` or `staging`) and fails with a list of problems. It checks:

- every sitemap `<loc>` (first 200) on the base host: 200, no redirect, canonical equals the URL, and exactly one `<h1>`;
- `/`, `/about`, `/explore`: 200, `application/ld+json` present where expected;
- `robots.txt`: production body vs `Disallow: /` on staging;
- `X-Robots-Tag`: absent in production, `noindex` on staging;
- in production only: `http://`, `www.` and `http://www.` all 301 to `https://locatic.dev/`;
- user agents `Googlebot`, `bingbot`, `OAI-SearchBot`, `ChatGPT-User`, `GPTBot`, `Claude-SearchBot`, `Claude-User`, `ClaudeBot`, `PerplexityBot`, `Google-Extended`, `CCBot`: 200 on `/` and one city page. These are spoofed user agents, so a pass means the WAF isn't blocking by user agent; real bots are confirmed in Cloudflare AI Crawl Control.

On staging, the sitemap lists `https://locatic.dev` URLs; rewrite them to the staging origin before fetching.

### Task E2: Verify on `development.locatic.dev`

1. `pnpm ci:quality`, `pnpm ci:build`, `pnpm e2e --project=chromium-public`. All pass, or failures are explained.
2. Open the PR from `feat/seo-aeo-launch` into `dev`. CI on `dev` deploys to development (`.github/workflows/convex-deploy.yml`).
3. `pnpm seo:check https://development.locatic.dev staging`. Expected: no problems.
4. Rich Results Test on the development URLs of `/`, `/about`, a profile, a project and an indexable city. No errors. Rich Results Test still parses pages served with `X-Robots-Tag: noindex`; it warns that the page isn't indexable, which is expected here.
5. Owner reviews all new copy: `about-content.ts`, landing definition, FAQ, city summary wording, titles.

### Task E3: Pre-merge review of everything `dev` will ship

Merging `dev` into `main` deploys all 35+ commits on `dev`, not just this plan (landing refactor, email campaigns, security headers, content limits).

1. `git log --oneline origin/main..origin/dev` and `git diff --stat origin/main origin/dev`. Read each PR description and flag anything not production-ready.
2. Resolve PR #36's open item before launch: the `weeklyDigest` default (plan says default-on with opt-out; code defaults to `false`).
3. Confirm production Convex env vars needed by `dev` are set (compare `.env.example` with the production deployment's environment), including `VITE_CF_BEACON_TOKEN` in the production build environment.
4. Run an adversarial review of `origin/main...feat/seo-aeo-launch` (once merged to dev: `origin/main...origin/dev`) per the review-prompt rules in the owner's global instructions. Verify findings before acting.

### Task E4: Merge and deploy

1. Open a PR from `dev` into `main`. Its description lists the SEO/AEO changes and links this plan.
2. Merge once the owner approves. CI on `main` deploys Convex production, then the production Worker (`.github/workflows/convex-deploy.yml`, job `deploy-production`).
3. Immediately run `pnpm seo:check https://locatic.dev production`.

### Task E5: Launch-day dashboard and DNS changes (owner, in Cloudflare and search consoles)

These need account access; they are not code.

- [ ] **`www`:** replace the `www` DNS record (currently pointing at a dead Vercel deployment) with a proxied record, plus a Redirect Rule: `www.locatic.dev/*` → `https://locatic.dev/${1}` (301, keep the query string).
- [ ] **Always Use HTTPS** and **HSTS** on (PR #36 follow-up).
- [ ] **AI Crawl Control:** allow GPTBot, ClaudeBot, Google-Extended, Applebot-Extended, CCBot and the search crawlers. Turn off the "Block AI bots" managed rule and AI Labyrinth (no longer needed once all crawlers are allowed). Turn off Cloudflare's managed robots.txt if it's on, so the app's `robots.txt` is the only one.
- [ ] **Crawler Hints** on (sends IndexNow pings to Bing and others when pages change).
- [ ] **Markdown for Agents** on, if the zone's plan includes it.
- [ ] **Google Search Console:** domain property via DNS TXT; submit `https://locatic.dev/sitemap.xml`; inspect `/`, `/about`, one city, one profile, one project.
- [ ] **Bing Webmaster Tools:** import from Search Console; submit the sitemap.
- [ ] **Clerk:** bot protection and disposable-email blocking (PR #36 follow-up).
- [ ] **GitHub org page:** create the public `locatic-dev/.github` repo with `profile/README.md` opening with `LOCATIC_DEFINITION` and linking `https://locatic.dev`. Set the org description and URL to match.
- [ ] Re-run `pnpm seo:check https://locatic.dev production` after the DNS and WAF changes. All bot user agents get 200, and `www` 301s.

---

## Phase F — After launch (not code; owners: founders)

- **Same description everywhere:** GitHub org, X, LinkedIn, Product Hunt, Hacker News profile: start with the first sentence of `LOCATIC_DEFINITION`.
- **Launch posts:** Show HN, r/SideProject, dev.to, and local developer communities and meetups in the cities with the most builders.
- **When the repo goes public:** switch `GITHUB_URL` back to the repo (Task A7 comment), put the definition at the top of its README, and add the repo to the Organization `sameAs`.
- **Monthly AI visibility check:** run each prompt 3–5 times in ChatGPT, Perplexity, Google (AI Overviews / AI Mode) and Claude, and log cited/mentioned rates in a spreadsheet:
  - "what is locatic"
  - "find developers in Bengaluru" (repeat for the top 3 cities)
  - "app to discover side projects near me"
  - "social network for developers by city"
  - "how do I find developers in my city to collaborate with"
- **Measurement baseline:** Search Console (Performance, Page indexing), Bing Webmaster Tools, Cloudflare Web Analytics referrers (`chatgpt.com`, `perplexity.ai`, `claude.ai`, `copilot.microsoft.com`, `gemini.google.com`), and Cloudflare AI Crawl Control request counts per bot.
- **Next release candidates** (only when the data supports them): monthly city reports as original data; an "on Locatic" README badge for builders; city × language pages once enough cities pass the thin-page threshold.

## Task order and dependencies

```
A1 → A2                          (robots uses isProductionHost)
A3, A4, A5, A6, A7               (independent; A5 needs A4 for slug links)
B1 → B2                          (both edit seo.ts)
B3 → B4                          (B4 reuses about-content)
B5 needs B2 (description only when indexable)
B6                               (independent)
C1 → C2 (needs B3) → C3 (needs B2) → C4 (needs A5) → C5 (needs B2, B5)
D1 (needs B2), D2 (needs B3), D3 (independent), D4 (needs B2, B5, C*)
E1 → E2 → E3 → E4 → E5
```

D4 is the largest and most independent task. If it slips, the rest can still merge with the default OG image. This release was scoped as "everything", so the owner decides whether to wait for D4.
