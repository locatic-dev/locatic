# Playwright personas and data

Plan item A1 (`docs/plans/2026-09-26-locatic-ux-audit-and-design-plan.md`, section 6) defines the personas; C10 builds the journeys on them. This file is the single list of what `pnpm e2e` needs from `.env.local` and from the Convex deployment it names. A normal run is release validation: missing requirements fail with setup instructions. Set `E2E_MODE=smoke` only for an intentionally partial local run; that mode skips tests whose documented external persona data is absent, while application errors and failed assertions still fail.

## How e2e data works

- Playwright drives `pnpm dev` (reused if already running on `E2E_BASE_URL`, default `http://localhost:3000`) against the Convex deployment and Clerk instance in `.env.local`. It cannot reach the in-memory `convex-test` fixtures in `convex/__tests__/fixtures.helpers.ts`, and those fixtures cannot seed a real deployment.
- The `preflight` Playwright project runs first. It requires every release persona variable, opens public Explore and waits for its discovery data to settle. The public and authentication projects depend on it, so a stale public Convex contract fails before the journeys run.
- `auth.setup.ts` signs in `E2E_CLERK_USER_EMAIL` with `@clerk/testing/playwright` and saves the session to `playwright/.clerk/user.json` (gitignored). The `chromium-authenticated` project reuses it. Without `E2E_CLERK_USER_EMAIL` and `CLERK_SECRET_KEY`, release validation fails; smoke mode skips the authenticated project.
- Specs that need a second or third Clerk user sign it in themselves in a fresh context (`signInFreshContext` in `personas.ts`).
- `.github/workflows/ci.yml` does not run `pnpm e2e`; it runs locally.
- The stored session token expires within a minute, so each test's first load goes through Clerk's development handshake, after which ClerkJS reloads the page once. Specs navigate after sign-in with `gotoRetryingAbort` or by clicking links, so that reload cannot abort them. Under a full parallel run the dev instance has also answered with HTTP 500 pages and a sign-in that did not stick (`auth.setup.ts` landing on `/sign-in`); rerun after a minute before reading those as defects.
- Nothing seeds persona data yet. Prepare it by hand in the dev deployment through the app (sign in, finish onboarding, import a repository, follow builders, send a message), or see request 2 below. A fixture-dependent journey fails in release validation when its expected row or state is absent; it skips only in smoke mode.

## Deployment and failure policy

The dev deployment must run this branch's Convex functions before release validation. There is no backend version endpoint, so the preflight exercises public Explore and each journey verifies the contract it uses. Missing functions, rejected arguments, old response shapes, application error pages and assertion failures are always failures—even with `E2E_MODE=smoke`. The suite never infers deployment age from error strings.

Use the two modes deliberately:

```sh
pnpm e2e                 # strict release validation; no prerequisite skips
E2E_MODE=smoke pnpm e2e  # partial local run; missing external fixtures may skip
```

Functions and shapes the branch adds or changes, from the implementation follow-ups:

- `explore.listPublic*`, `explore.listNearbyBuildersPublic`, the `language`, `topic` and `openToCollab` arguments of `explore.list`
- `projects.getProjectSignals`, `projects.listMoreFromOwnerCity`, `projects.listLandingShowcase`, `projects.save` and the saves queries
- `users.publicProfileOverview` (pinned projects, shipping log), `home.list` (`actorGithubUsername`)
- `cities.listActiveForMap` and the city page queries, `metrics.record`
- the notifications internal backfill; `viewerInboxSummary` removed

Some stale contracts have no distinctive error. For example, an older `home.list` returns items without `actorGithubUsername`, so Home renders no builder link and the discovery journey fails on its last step. Deploy the branch before interpreting a failure; do not waive the failure based on its text.

## Environment variables

| Variable                          | Used by                                                  | Missing in release validation |
| --------------------------------- | -------------------------------------------------------- | ----------------------------- |
| `CLERK_SECRET_KEY`                | `auth.setup.ts`, every sign-in                           | preflight fails               |
| `E2E_CLERK_USER_EMAIL`            | populated user (all `*.authenticated.spec.ts`, journeys) | preflight fails               |
| `E2E_PUBLIC_PROFILE_USERNAME`     | populated user's GitHub login, for public profile specs  | preflight fails               |
| `E2E_CLERK_EMPTY_CITY_USER_EMAIL` | empty-city user (`explore-empty-city`)                   | preflight fails               |
| `E2E_EMPTY_CITY_NAME`             | empty-city user's city (default `Mysuru`)                | the default is used           |
| `E2E_OTHER_CITY_NAME`             | a city with public builders (default `Bengaluru`)        | the default is used           |
| `E2E_CLERK_ONBOARDING_USER_EMAIL` | a user that never finishes onboarding (`onboarding`, A6) | preflight fails               |

## Personas

| Persona            | Playwright project                                | Clerk user                                          |
| ------------------ | ------------------------------------------------- | --------------------------------------------------- |
| Signed-out visitor | `chromium-public`, or `SIGNED_OUT_STATE`          | none                                                |
| Populated user     | `chromium-authenticated`                          | `E2E_CLERK_USER_EMAIL`                              |
| Empty-city user    | fresh context in `explore-empty-city`             | `E2E_CLERK_EMPTY_CITY_USER_EMAIL` (not yet created) |
| Onboarding user    | fresh context in `onboarding`, `auth-destination` | `E2E_CLERK_ONBOARDING_USER_EMAIL` (not yet created) |

### Signed-out visitor

No cookies and no Clerk session. Needs no data of its own, but the public specs need the deployment to hold:

- At least one exact-city builder, visible in Explore, with a public profile and a project eligible for Explore (`discovery`, `city.public`, `axe.public`, `visual.public`). The populated user's city covers this.
- At least one other such builder besides the populated user, with public activity from the last 30 days, for the full discovery journey (discover, profile, sign in, return, follow, Home shows their activity).
- For the landing checks (`landing.public`, D7): at least five active cities with `builderCount > 0` and at least one eligible project. With fewer, the landing labels its examples and strict validation fails the "landing city to city page" prerequisite.

### Populated user (`E2E_CLERK_USER_EMAIL`)

The shape mirrors the `alice` role in `seedPopulatedCity`. For strict release validation to pass:

- Onboarding completed.
- `privacy.cityVisibility: 'exact_city'`, `appearInExplore: true`, and a profile city with at least two other exact-city builders who have visible projects.
- At least one selected city on Explore (`exploreConfig.cityIds` or the profile city), so Explore opens with a city pill (`touch-targets` pill audit).
- At least one visible project with a release or a post. Profile baselines change whenever the shipping log changes (X3).
- At least one comment of their own on a project (`project-page` delete confirmation).
- Follows at least one builder who has an activity event from the last 30 days, so Home is not empty (C5) and `profile.authenticated` can unfollow and undo. Home drops items older than 30 days daily, so this data drifts.
- At least one inbox conversation, and one outgoing pending request (`isRequest: true`, last message sent by this user) (C9, `inbox`, `mobile-ui`).
- At least one unread notification (`notifications`). The notification click test marks one read, so a rerun needs a new unread notification.
- Explore must list at least one project owned by someone else, so Save is offered (`saves`) and the DM failure toast has a builder to message (`inbox`).
- The synced city catalogue must answer the prefix `ber` with at least one city (Berlin, Bern) for `explore-header`.

### Empty-city user (`E2E_CLERK_EMPTY_CITY_USER_EMAIL`)

A second Clerk user, because the two need different profile cities. Mirrors `seedEmptyCity`:

- Onboarding completed, `privacy.cityVisibility: 'exact_city'`, profile city set to an active catalogue city with no other eligible builders or projects (`E2E_EMPTY_CITY_NAME`, default Mysuru, which sits near Bengaluru so the nearby-city suggestions have something to show).
- No projects, follows or conversations.
- `E2E_OTHER_CITY_NAME` (default Bengaluru) must be in the catalogue for "choose another city".

It covers the empty-city copy, count and actions (C2), nearby cities (D5) and the choose-another-city journey (C10).

### Onboarding user (`E2E_CLERK_ONBOARDING_USER_EMAIL`)

A third Clerk user that has signed in once but never pressed "finish". Most onboarding specs stop before "finish", so the user stays reusable. They need `E2E_OTHER_CITY_NAME` to have at least one eligible builder (the follow step appears) and `E2E_EMPTY_CITY_NAME` to have none (the flow ends on the repository step). Strict validation also requires a resettable user for "finishing onboarding opens the destination"; until that fixture exists, the journey fails its prerequisite (or skips in smoke mode).

## Screenshot baselines

`visual.public.spec.ts` and `visual.authenticated.spec.ts` compare every route at 1440 and 390 with `*-snapshots/<name>-<width>-<project>-<platform>.png`. Times, relative times, the contribution graph and maps are masked (`fixtures/visual.ts`). Baselines are generated only for routes that ran: `pnpm exec playwright test visual --update-snapshots` after a reviewed visual change. They are platform-specific (darwin here) and depend on persona data, so regenerate them when the data changes. Explore briefly shows "showing 1 city" before the city document loads; the baseline waits for loading states to clear.

Home, Explore, Inbox, Notifications and the own-profile/project baselines require their documented populated content before comparison. Existing images captured from an empty or stale deployment are not approved references; review and regenerate them only after the branch functions and personas are prepared.

## Requests to the owner

1. **Second and third Clerk test users.** Create them in the Clerk development instance, add their emails to `.env.local` as `E2E_CLERK_EMPTY_CITY_USER_EMAIL` and `E2E_CLERK_ONBOARDING_USER_EMAIL`, onboard the empty-city user once into an otherwise empty city, and sign the onboarding user in once without finishing.
2. **Decide how e2e data gets seeded.** "No e2e spec skips for missing data" needs either (a) the manual preparation above, documented in `README.md` (no code, but the data drifts), or (b) an idempotent `internalMutation`, restricted to the dev deployment, that recreates the persona data keyed by each test user's `clerkId`, run with `npx convex run` before `pnpm e2e`. Option (b) runs against a deployment, so it needs your explicit approval and would be its own plan item.
3. **Set `E2E_PUBLIC_PROFILE_USERNAME`** to the populated user's GitHub login.
4. **Deploy the branch's Convex functions to the dev deployment** before running strict e2e validation (see Deployment and failure policy).
