# Dependency maintenance

This policy covers npm packages, the pnpm and Node toolchain, and GitHub Actions. The repository owner handles the weekly review until another maintainer accepts responsibility. These are maintenance targets, not public response-time guarantees.

## Weekly review

[Renovate](../renovate.json) checks npm and Actions updates on Mondays, 00:00–05:59 UTC. Regular updates have five concurrent PRs and two new PRs per hour. TanStack/Clerk minor and patch updates are grouped; major updates stay separate. Lockfile maintenance runs weekly. Scripts and automerge are disabled, and npm updates observe a one-day release age.

The separate [advisory audit](../.github/workflows/dependency-audit.yml) runs Mondays at 06:23 UTC or by manual dispatch. Full and production jobs audit the committed lockfile without installing packages and retain JSON reports for 14 days. Advisories and registry/setup errors fail the jobs.

[Dependency review](../.github/workflows/dependency-review.yml) checks PRs targeting `dev` and `main` and fails when introduced dependencies have high or critical advisories. It uses a read-only token and does not execute PR code or receive provider secrets. The weekly audit remains necessary for newly published advisories affecting dependencies already present.

Pin Actions to verified full commit SHAs and retain version comments for review. Review digest updates through the existing update process; do not replace pins with moving version tags.

Each week, check both jobs, the Renovate dashboard, alerts, and stalled PRs. If there is no successful audit within eight days, inspect schedule/runner failures and dispatch it or run locally:

```sh
pnpm audit --json
pnpm audit --prod --json
```

Run fresh audits before releases and after changing resolutions. A missing run or registry error is not a clean audit.

## Triage an advisory

1. Record the GHSA/CVE, primary advisory, resolved version, fixed versions, dependency chain (`pnpm why PACKAGE`), and affected revision.
2. Trace exposure through browser, Worker/SSR, Convex, build/emulation, test, CLI, and distributed artifacts. Record attacker input, permissions, and configuration needed to reach the affected operation. A production dependency can still be build-only; neither classification proves safety.
3. Assign an owner and prefer compatible upstream/parent updates. Use a narrow transitive override only with a removal condition. Keep sensitive reports private through [SECURITY.md](../SECURITY.md).
4. Run full/production audits and focused regressions. Application/toolchain updates require `pnpm ci:quality` and `pnpm ci:build`; browser changes also need `pnpm e2e:components`. Auth/import/backend changes need matching isolated provider QA. Check notices and native builds. Validate permissions/events for Actions updates.
5. Record the fixed revision and deployment status, or an approved exception. Local updates do not prove deployed versions changed.

For active exploitation or reachable critical/high issues, triage the same day, contain promptly, and aim for a reviewed fix within 48 hours. For critical/high issues with unknown exposure, triage within one business day and fix within seven days or approve an exception. Triage other issues within seven days and fix within 30 days or approve an exception.

An exception records the exposure evidence, compensating controls, named owner/approver, decision, next review, fix trigger, and expiry within 30 days. Renewal needs fresh evidence. Expired exceptions remain unresolved; do not suppress audit or registry failures.

## Keep install safeguards

Use the runtime and package-manager contract in `package.json`. Keep `minimumReleaseAge`, `blockExoticSubdeps`, `strictDepBuilds`, and the reviewed native-build allowlist in `pnpm-workspace.yaml`. Review new native builds and version-scoped overrides explicitly. Do not run broad `audit --fix` or force major versions to remove warning counts.

Lockfile audits do not inventory pnpm itself, Node, Actions, remote services, or non-JavaScript container contents. Check the exact executable version against all upstream advisory ranges before selecting an update; one advisory's minimum fix may still match another advisory.

Security PRs may bypass Renovate's weekly schedule and release-age delay, but still require review and obey pnpm's install policy. Any urgent age-window exception must be narrow and recorded; keep the global safeguard enabled.

## Activate and verify automation

Enable Renovate access, the dependency graph, vulnerability alerts, and Actions schedules on the hosting repository. Avoid overlapping npm update bots without an ownership decision. Verify a real bot lockfile PR with the pinned toolchain, its CI and human review, both scheduled audit jobs, and maintainer notification delivery. If lockfile generation fails, diagnose it rather than downgrading the package manager or relaxing safeguards.

References: [Renovate npm manager](https://docs.renovatebot.com/modules/manager/npm/), [configuration options](https://docs.renovatebot.com/configuration-options/), and [pnpm audit](https://pnpm.io/cli/audit).
