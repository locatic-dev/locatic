# Contributing to Locatic

Use Node 24 and the pnpm version in `package.json`. Follow [Contributor setup](docs/CONTRIBUTOR_SETUP.md) with your own development providers and test accounts. Read the nearest `AGENTS.md` for files you change.

Keep changes focused. Describe the problem, resulting behavior, and verification in your pull request. Include regression tests for bugs. Keep unit tests beside the source and use `convex-test` for server authorization and privacy contracts.

Target `dev` for ordinary contributions. Maintainers promote reviewed changes from `dev` to `main` through release PRs. Use merge commits for releases and branch synchronization; squash merges are suitable for short-lived feature branches. Send production hotfixes back to `dev` through a reviewed PR. Code owners are requested for review when a PR is ready.

Run `pnpm ci:quality` and `pnpm ci:build` for changes across layers. Use `pnpm e2e:components` for browser behavior; full integration tests require the [documented personas](playwright/fixtures/fixtures.md). Format only changed files with `pnpm exec oxfmt <files>`. Do not edit generated routes or Convex bindings by hand.

Follow the [maintenance policy](docs/DEPENDENCY_MAINTENANCE.md) for dependency changes. Include exposure, runtime, native-build, and license changes in the PR. Keep install safeguards enabled and review bot updates before merging.

Never commit credentials, browser sessions, private member data, or unredacted provider responses. Keep local review notes, investigation journals, and member screenshots outside the source tree. Review [Operations](docs/OPERATIONS.md) before deploying or migrating data; use disposable accounts for QA.

Contributions use the [MIT License](LICENSE). Submit only material you have authority to contribute, retain attribution, and identify new dependency, data, or asset licenses. No separate CLA or copyright assignment is required. See [Third-party notices](THIRD_PARTY_NOTICES.md).

Report vulnerabilities privately through [SECURITY.md](SECURITY.md). Keep discussion respectful and specific to the work; do not post harassment or personal information.
