# Operations and migrations

Use isolated development providers and test accounts for verification. Keep credentials, deployment identifiers, provider responses, and environment audit results in private operational records.

## Validate a release

Run `pnpm ci:quality`, `pnpm ci:build`, `pnpm e2e:components`, and fresh full/production dependency audits. Run the provider-backed journeys in [Development QA](DEVELOPMENT_QA.md) against the matching backend revision: fresh sign-in, onboarding, repository import/denial, reload/logout, privacy, nested comment links, and deletion/recovery/cleanup.

Before enabling credentialed workflows, configure required PR reviews/checks and protected environments. The manual `member-qa.yml` workflow uses `development-qa` and fails closed on its environment policy. Restrict it to trusted `main`/`dev` revisions, require independent approval, and use disposable credentials. Configure variables/secrets from the workflow and verify notification delivery. See [Dependency maintenance](DEPENDENCY_MAINTENANCE.md) for bot and audit activation.

The existing App Deploy workflow runs after successful CI pushes to `dev` or `main`. It validates the target build, deploys Convex, and then deploys the Worker under one environment lock. A failed Convex deployment stops the Worker step. Merging into those branches can deploy; the separate manual QA workflow is not an automatic prerequisite.

App Deploy accepts only CI push runs from this repository. It checks out the fixed target branch and compares its revision with the successful CI run before installing dependencies. If the branch has advanced, deployment stops; use the successful CI run for the current branch revision. Provider secrets are available only to their deployment steps.

Environment branch restrictions apply to the workflow ref, which is `main` for the current `workflow_run` trigger, including development deployments. Production also requires independent approval. Keep `development` restricted to the workflow's `main` ref until changing this trigger. The source-branch and revision checks still select the development code.

After promoting workflow changes to both protected branches, verify code-owner review and the `Dependency review` check before requiring them in rulesets. Enable SHA-only Actions enforcement only when all applicable branches use full commit pins. Review CodeQL PR results on both targets before requiring its merge gate; a successful analysis can still report alerts.

Retain the [dependency/font/data notices](../THIRD_PARTY_NOTICES.md) with distributed artifacts. Review the exact source and asset inventory, licensing authority, and private security-report delivery before publication.

## Observe before retiring data

The audit CLI compiles canonical helpers locally in plan mode:

```sh
pnpm oss:audit --deployment YOUR-DEPLOYMENT --plan
```

To inspect a selected deployment with existing CLI read access:

```sh
pnpm oss:audit --deployment YOUR-DEPLOYMENT --output /tmp/locatic-readiness.json
```

The second command submits query source to Convex and uses its read-only inline-query sandbox. It follows bounded pages and creates a new mode-0600 report containing aggregate counts and pending function names. Keep that report private. Pages are separate consistent reads, not a database-wide snapshot.

Record the deployed revision, a controlled quiet window, scan counts, complete outer and nested job cursors, pending scheduler state, relevant count/snapshot parity, and backup/rollback reference. The audit does not prove every invariant, provider/component cleanup, or migration phase is complete. Confirm those separately before retiring fields or backfills.

## Compatibility and cleanup

- `users:backfillOwnerState` schedules per-user synchronization. Wait for the outer scan and every eligible user's `lifecycleOwnerSync.stage === 3`; accounts skipped for purge must finish purge. Only then recount city statistics.
- Profile/privacy changes commit current user authority immediately. Owner snapshots, discovery indexes, and project city counters converge in pages; reads apply live privacy during that interval.
- Keep bounded legacy Inbox interfaces until old-client use ends. Reverting source does not restore erased data.
- Account purge cursors are versioned. Progress without `purgeProgress.queryVersion` and with a cursor finishes its stage with the original query (`accountIndexed` included); later stages use the indexed phases. Do not roll back below this version while any `purgeProgress.queryVersion` exists: older code cannot read those cursors, and the older schema rejects the new fields. Purges started by older code are adopted once by the next cleanup, deadline timer or queued continuation.
- A stalled purge (for example after a failing page) keeps its claim. After fixing the cause, resume it with the stored step: `pnpm exec convex run users:scrubDeletedAccount '{"userId":"…","expectedStep":<purgeProgress.step>}'`. A run without `expectedStep` does nothing once a purge is claimed.
- Remove legacy consent, reaction, route, or profile fields only after every target deployment has valid retained rows and no pending consumers/jobs. Email migrations must preserve opt-outs and irreversible deletion guards; do not reinterpret a backfill as new consent.
- Pulse is deprecated and unused. Retain its schema/compatibility records until a separate data-retention decision and migration are complete; regenerate bindings normally when removing modules.

Inspect each migration's actual arguments and continuation contract before invoking it. Some schedule their next batch; others return a cursor for the caller to continue. Deployment success alone does not establish migration completion.
