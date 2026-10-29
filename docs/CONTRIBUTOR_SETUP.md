# Contributor setup

Use Node 24 and the pnpm version pinned in [package.json](../package.json). Copy `.env.example` to `.env.local`; never commit the populated file.

## Checks without provider accounts

```sh
pnpm install --frozen-lockfile
pnpm ci:quality
pnpm exec playwright install chromium
pnpm e2e:components
```

For a build without configured providers, use these nonfunctional public placeholders:

```sh
VITE_CONVEX_URL=https://example.convex.cloud VITE_CLERK_PUBLISHABLE_KEY=pk_test_ZXhhbXBsZS5jbGVyay5hY2NvdW50cy5kZXYk pnpm ci:build
```

Component tests use production views with memory data. They do not establish authentication, SSR, or provider integration.

## Configure development providers

1. Create a Clerk development application and a separate Convex development project. Run `pnpm exec convex dev` to select that project and upload the backend. Use your own providers and test accounts.
2. Enable GitHub sign-in in Clerk. With custom OAuth credentials, use Clerk's displayed callback URL in your GitHub OAuth app. Set matching `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, and `VITE_CONVEX_URL` locally.
3. Activate Clerk's [Convex integration](https://clerk.com/docs/guides/development/integrations/databases/convex). Tokens must have audience `convex`. Set `CLERK_JWT_ISSUER_DOMAIN` in the Convex runtime to that Clerk instance's Frontend API URL. Older setups can use the JWT template named `convex` with the same audience and issuer. Keep audience validation enabled.
4. Map email, name, picture, and username claims. `convex/lib/auth.ts` consumes normalized `email`, `name`, `pictureUrl`, and `preferredUsername` or `nickname`; `sub` is the Clerk user ID. Inspect claim names without sharing tokens. Verify that webhook reconciliation maps the profile to the connected GitHub identity.
5. Set `CLERK_SECRET_KEY` separately in the Convex runtime for GitHub actions. Configure signed Clerk events `user.created`, `user.updated`, and `user.deleted` at `https://YOUR-DEPLOYMENT.convex.site/clerk/webhooks`, with its matching `CLERK_WEBHOOK_SIGNING_SECRET`. Local env files do not configure Convex runtime variables.
6. Keep outbound email and contact synchronization disabled unless testing that subsystem with isolated recipients. See [Community email](community-email.md).

Run `pnpm dev`, sign in, complete onboarding, import an owned public repository, reload, and sign out. Confirm signed-out visits to Settings and Inbox return to sign-in.

## GitHub permissions

Start with profile/email read scopes such as `read:user` and `user:email`. Public repository import does not require private-repository access. `public_repo` grants write capabilities and `repo` includes private repositories; do not request either by default. See [GitHub's scope definitions](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps).

Imports require a trusted GitHub identity, a public repository, and ownership or admin, maintain, or push permission. Pull and triage access do not permit a claim. Organization OAuth restrictions or SSO may prevent imports; do not broaden credentials automatically to bypass a denial.

## City data

`convex/citiesSeed.ts` provides a small bootstrap catalog through the seed function and daily cron. A fresh deployment does not load a worldwide catalog automatically; onboarding supports continuing without a city.

The optional [GeoNames snapshot](../data/geonames/README.md) includes source URLs, CC BY 4.0 attribution, and hashes. `pnpm cities:catalog --check` verifies inputs and regenerates the fixed-timestamp catalog. It requires Node 24 and `unzip`. Use `pnpm cities:catalog --output /tmp/locatic-cities.jsonl` to write a new artifact. Generation does not import a database; preserve existing city IDs and references when planning an import.

## Integration tests

Follow [Development QA](DEVELOPMENT_QA.md) and the [fixture contract](../playwright/fixtures/fixtures.md) for the three isolated Clerk personas and matching backend revision. Smoke mode is partial. The protected manual member-QA workflow requires trusted code, a protected development environment, and disposable credentials. Synthetic fixtures establish rendering and journeys; real GitHub imports and provider cleanup need separate integration checks.
