# Playwright personas and data

This file defines what `pnpm e2e` needs from `.env.local` and the selected Convex deployment. Missing requirements fail with setup instructions. Set `E2E_MODE=smoke` for an intentionally partial local run; it skips tests whose external persona data is absent, while application errors and failed assertions still fail.

## How e2e data works

- Playwright drives `pnpm dev` (reused if already running on `E2E_BASE_URL`, default `http://localhost:3000`) against the Convex deployment and Clerk instance in `.env.local`. It cannot reach the in-memory `convex-test` fixtures in `convex/__tests__/fixtures.helpers.ts`, and those fixtures cannot seed a real deployment.
- The `preflight` Playwright project runs first. It requires every release persona variable, opens public Explore and waits for its discovery data to settle. The public and authentication projects depend on it, so a stale public Convex contract fails before the journeys run.
- `auth.setup.ts` signs in `E2E_CLERK_USER_EMAIL` with `@clerk/testing/playwright` and saves the session to `playwright/.clerk/user.json` (gitignored). The `chromium-authenticated` project reuses it. Without `E2E_CLERK_USER_EMAIL` and `CLERK_SECRET_KEY`, release validation fails; smoke mode skips the authenticated project.
- Specs that need a second or third Clerk user sign it in themselves in a fresh context (`signInFreshContext` in `personas.ts`).
- `.github/workflows/ci.yml` runs quality, production build/bundle budget, and the provider-free `pnpm e2e:components` gate. Its component fixtures import real public/legal, identity and Settings UI, but do not validate SSR or provider/backend integration. The manually dispatched `member-qa.yml` defines the protected development journey gate; configure its environment reviewers/branches/secrets and prepare the matching backend/personas before running it. No deployment is performed by either workflow.
- The stored session token expires within a minute, so each test's first load goes through Clerk's development handshake, after which ClerkJS reloads the page once. Specs navigate after sign-in with `gotoRetryingAbort` or by clicking links, so that reload cannot abort them. Under a full parallel run the dev instance has also answered with HTTP 500 pages and a sign-in that did not stick (`auth.setup.ts` landing on `/sign-in`); rerun after a minute before reading those as defects.
- Prepare the dedicated disposable dataset using the [guarded fixture runbook](../../docs/DEVELOPMENT_QA.md). Strict preflight reads the internal fixture status, requires a preparation less than 24 hours old and matches the populated handle. It does not reset the full dataset automatically. Onboarding specs explicitly reset only their dedicated persona; the `chromium-onboarding` project serializes those specs. Missing/stale data fails release validation and may skip only in smoke mode.

## Deployment and failure policy

The dev deployment must run this branch's Convex functions before release validation. There is no backend version endpoint, so the preflight exercises public Explore and each journey verifies the contract it uses. Missing functions, rejected arguments, old response shapes, application error pages and assertion failures are always failures—even with `E2E_MODE=smoke`. The suite never infers deployment age from error strings.

Use the two modes deliberately:

```sh
pnpm e2e                 # strict release validation; no prerequisite skips
E2E_MODE=smoke pnpm e2e  # partial local run; missing external fixtures may skip
```

Functions and shapes the branch adds or changes, from the implementation follow-ups:

- `explore.listPublic*`, `explore.listNearbyBuildersPublic`, the `language`, `topic` and `openToCollab` arguments of `explore.list`
- `projects.getProjectSignals`, `projects.listMoreFromOwnerCity`, `landing.listRecentActivity`, `projects.save` and the saves queries
- `users.publicProfileOverview` (pinned projects, shipping log), `home.list` (`actorGithubUsername`)
- `cities.listActiveForMap`, `cities.listNearby` (Explore rail) and the city page queries, `metrics.record`
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
| `E2E_CLERK_ONBOARDING_USER_EMAIL` | a resettable user (`chromium-onboarding`)                | preflight fails               |

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
- At least one project in global Explore with a reaction (count above zero), so the visitor check that reaction counts keep full contrast has a counted pill (`discovery.public`).
- For the landing checks (`landing.public`): at least five active cities with `builderCount > 0` and at least one eligible project. With fewer, the landing labels its examples and strict validation fails the "landing city to city page" prerequisite.

### Populated user (`E2E_CLERK_USER_EMAIL`)

The shape mirrors the `alice` role in `seedPopulatedCity`. For strict release validation to pass:

- Onboarding completed.
- `privacy.cityVisibility: 'exact_city'`, `appearInExplore: true`, and a profile city with at least two other exact-city builders who have visible projects.
- At least one selected city on Explore (`exploreConfig.cityIds` or the profile city), so Explore opens with a city pill (`touch-targets` pill audit).
- At least one visible project with a release or a post. Profile baselines change whenever the shipping log changes.
- At least one comment of their own on a project (`project-page` delete confirmation).
- Follows at least one builder who has an activity event from the last 30 days, so Home is not empty and `profile.authenticated` can unfollow and undo. Home drops items older than 30 days daily, so this data drifts.
- At least one inbox conversation, and one outgoing pending request (`isRequest: true`, last message sent by this user) (`inbox`, `mobile-ui`).
- At least one unread notification (`notifications`). The notification click test marks one read, so a rerun needs a new unread notification.
- Explore must list at least one project owned by someone else, so Save is offered (`saves`) and the DM failure toast has a builder to message (`inbox`).
- The synced city catalogue must answer the prefix `ber` with at least one city (Berlin, Bern) for `explore-header`.
- For `email-campaigns`, the development deployment needs this user's Clerk id in `EMAIL_ADMIN_CLERK_IDS`, `EMAIL_TEST_SENDING_ENABLED=true`, `delivered@resend.dev` in `EMAIL_TEST_RECIPIENTS`, and the sender settings (`EMAIL_FROM`, `EMAIL_REPLY_TO`, `SITE_URL`, `RESEND_API_KEY`). Leave `EMAIL_SENDING_ENABLED` off. Each run creates one draft update and sends one test to Resend's `delivered@resend.dev` test address; it opens the send confirmation and closes it without sending.

### Empty-city user (`E2E_CLERK_EMPTY_CITY_USER_EMAIL`)

A second Clerk user, because the two need different profile cities. Mirrors `seedEmptyCity`:

- Onboarding completed, `privacy.cityVisibility: 'exact_city'`, profile city set to an active catalogue city with no other eligible builders or projects (`E2E_EMPTY_CITY_NAME`, default Mysuru, which sits near Bengaluru so the nearby-city suggestions have something to show).
- No projects, follows or conversations.
- `E2E_OTHER_CITY_NAME` (default Bengaluru) must be in the catalogue for "choose another city".

It covers the empty-city copy, count and actions, nearby cities and the choose-another-city journey.

### Onboarding user (`E2E_CLERK_ONBOARDING_USER_EMAIL`)

A third verified Clerk development user with a connected GitHub identity. The guarded preparation leaves onboarding incomplete; before each onboarding test, the internal `developmentFixtures:resetOnboarding` mutation resets only this manifest-bound user after checking the pinned target, test key, email, allowlist, active state and absence of imported projects. No public reset API exists. These specs run serially in `chromium-onboarding`, including actual finish-to-destination and finish-to-Explore cases.

They need `E2E_OTHER_CITY_NAME` to have eligible builders and `E2E_EMPTY_CITY_NAME` to have none; preparation provides Bengaluru and Mysuru. All fixture email sending/contact sync stays off. The separately authorized email campaign suite requires a different dedicated environment and is excluded from this fixture gate.

## Screenshot baselines

`visual.public.spec.ts` and `visual.authenticated.spec.ts` compare every route at 1440 and 390 with `*-snapshots/<name>-<width>-<project>-<platform>.png`. Times, relative times, the contribution graph and maps are masked (`fixtures/visual.ts`). Baselines are generated only for routes that ran: `pnpm exec playwright test visual --update-snapshots` after a reviewed visual change. They are platform-specific (darwin here) and depend on persona data, so regenerate them when the data changes. Explore briefly shows "showing 1 city" before the city document loads; the baseline waits for loading states to clear.

Home, Explore, Inbox, Notifications and the own-profile/project baselines require their documented populated content before comparison. Existing images captured from an empty or stale deployment are not approved references; review and regenerate them only after the branch functions and personas are prepared.

## Operator prerequisites

Create three distinct Clerk development users with verified primary emails and connected GitHub accounts, deploy the reviewed backend to a dedicated disposable target, then follow [DEVELOPMENT_QA.md](../../docs/DEVELOPMENT_QA.md). Set the persona emails, populated GitHub handle and explicit fixture target/reset opt-in. Preparation reads real provider identities and uses synthetic showcase content; it never creates provider accounts or proves a real repository import. Keep the source revision, fixture generation and strict run result with release evidence.
