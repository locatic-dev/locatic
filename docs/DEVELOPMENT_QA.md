# Disposable development QA

The fixture functions are internal and disabled by default. They are intended only for a dedicated, disposable Convex deployment paired with a Clerk **development** instance. The ordinary app never calls them. Do not point them at an existing member/production environment.

## Prepare once per strict run

1. Create three distinct Clerk development users for populated, empty-city and onboarding roles. Each needs a verified primary email and a connected GitHub account. Record their Clerk IDs, primary emails and GitHub handles privately. Preparation reads Clerk identities; it does not create accounts, change provider data or invent stable GitHub IDs.
2. Separately review and deploy the backend revision to the disposable target. Stop other QA runs, webhooks and background imports/writers while replacing the full fixture dataset. Use a fresh dedicated deployment if this cannot be guaranteed. Do not reset a shared database. Component-owned data is not reset by this application-table tool; keep all outbound email/contact integrations disabled.
3. In **that Convex deployment's runtime configuration**, set `E2E_FIXTURES_ENABLED=true`, `E2E_FIXTURE_CONVEX_URL` to its exact HTTPS `.convex.cloud` origin, `E2E_FIXTURE_CLERK_IDS` to exactly the three comma-separated Clerk IDs, and its matching `CLERK_SECRET_KEY=sk_test_…`. Set `EMAIL_SENDING_ENABLED`, `EMAIL_CONTACT_SYNC_ENABLED`, and `EMAIL_TEST_SENDING_ENABLED` to `false`. Store provider credentials in runtime configuration; never paste secrets into a transcript or issue.
4. With CLI access to that exact deployment, invoke the internal action below. Replace all placeholders. Do not add `--push`. The first preparation accepts an empty application database without `reset`; a replacement requires explicit `"reset":true`. The same request key/identities is idempotent; use a new request key to refresh consumed/aged fixtures.

```sh
pnpm exec convex run developmentFixtureActions:prepare '{"clerkIds":{"populated":"user_POPULATED","empty":"user_EMPTY","onboarding":"user_ONBOARDING"},"confirmTarget":"https://YOUR-DISPOSABLE-DEPLOYMENT.convex.cloud","requestKey":"reviewed-revision-run-1"}' --deployment YOUR-DISPOSABLE-DEPLOYMENT --codegen disable
pnpm exec convex run developmentFixtures:status '{"confirmTarget":"https://YOUR-DISPOSABLE-DEPLOYMENT.convex.cloud"}' --deployment YOUR-DISPOSABLE-DEPLOYMENT --codegen disable
```

The reset checks test keys, pinned target, outbound flags and the exact identity allowlist before each page. Unknown users are refused. It deletes at most 25 application rows/128 kB per page, advances generation/stage/cursor and schedules continuation in the same transaction, then installs a fixed-size dataset with production snapshot/counter builders. A failed page does not advance; inspect the scheduler privately, correct the cause, then retry the exact stored generation/stage/cursor via `developmentFixtures:step`. Stale/replayed steps do nothing. A new preparation supersedes older generations. Never bypass a safety check to recover a reset.

Wait for `status: "ready"`. Status reports generation, stage, preparation time and the populated handle, without emails/content. Configure the local app and protected job with matching provider settings and:

```text
E2E_CLERK_USER_EMAIL=<populated primary email>
E2E_CLERK_EMPTY_CITY_USER_EMAIL=<empty-city primary email>
E2E_CLERK_ONBOARDING_USER_EMAIL=<onboarding primary email>
E2E_PUBLIC_PROFILE_USERNAME=<populated GitHub handle>
E2E_FIXTURE_CONVEX_URL=https://YOUR-DISPOSABLE-DEPLOYMENT.convex.cloud
E2E_RESET_FIXTURES=1
```

`VITE_CONVEX_URL` must match the pinned fixture origin. Strict preflight requires a ready dataset prepared within 24 hours. Local CLI login or the protected job's dedicated development deployment key authorizes internal status/onboarding reset calls. The browser cannot invoke them. The key is powerful: never use a production key or expose it to PR code.

## What preparation supplies

- Three real test-persona records, six explicitly synthetic discovery actors, six cities with five active showcase cities and an otherwise empty Mysuru.
- Visible synthetic projects/releases, a contribution graph, current Home activity, follows, a counted reaction, a nested project comment thread, an accepted conversation, an outgoing request and an unread notification.
- Real Clerk/GitHub identity mapping for the three sign-in personas; negative repository/release IDs for synthetic content so it is distinguishable from real imports.

The suite may consume notifications/follows/messages; recreate the full dataset before a new strict run. Onboarding specs reset only their dedicated active, project-free persona by manifest ID and exact expected email, then run serially. The campaign send test is excluded because its configuration conflicts with the fixture requirement that outbound sending is disabled.

## Verification boundary

Run `pnpm e2e --project=chromium-public --project=chromium-authenticated --project=chromium-onboarding --grep-invert 'baselines|writes, previews and tests an update'` from reviewed trusted code. Record source revision, target, generation, timestamps and pass/failure output privately. Synthetic content proves rendering/journey setup, not a successful GitHub import: independently sign in, import an owned public test repository, reload, sign out and check public/private access on the matching backend. Organization/collaborator import and lifecycle cleanup also need isolated provider evidence.

Unit tests exercise fixture functions with `convex-test`. Component browser tests use memory adapters. Neither substitutes for provider-backed integration checks.

## Keep visual fixtures synthetic

Tracked screenshots come from `playwright/components/visual.spec.ts` and local fixtures. The Inbox fixture uses invented identities, locations, and messages with no remote avatars. The component suite compares Inbox lists and threads, privacy controls, and account recovery at desktop and phone widths. It blocks external requests during visual tests.

Run `pnpm e2e:components`. To review a deliberate visual change, run `pnpm e2e:components --update-snapshots`, inspect every changed image, and commit only synthetic component baselines. Shared baselines allow a small pixel difference for font rendering across operating systems. Geometry and interaction checks run separately.

Provider-backed route baselines remain available for local comparison. Set `E2E_PRIVATE_BASELINE_DIR` to an absolute directory outside the checkout before running the `baselines` tests. Keep that directory private. Provider baselines, failure screenshots, and traces may contain account data. Do not commit them or publish them as review attachments. Removing an image from current source does not remove earlier Git or GitHub copies.
