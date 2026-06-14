# GitHub-Backed Project Data Hardening

## Status

Implemented in code. Deploy-time data verification is still required per environment before treating the README URL-base keys as fully present in dev and prod data.

## Findings

- README markdown is cached on `projects.github.readmePreview`; it is not dynamically fetched on every project page view.
- Existing records could have `readmePreview: null` legitimately when GitHub has no README. The URL-base keys must still exist so the frontend can render a stable contract.
- Locatic likes are local-only. The previous `githubSyncAttempted` response shape and `syncGithubStarsOnLike` viewer preference implied a GitHub star sync that the product no longer supports.
- Project visibility checks were repeated across comments, reactions, likers, and metadata refresh paths.
- `projects.refreshMetadata` was public and delegated to an internal GitHub action without first proving the caller owned the project.
- Contributor sync had schema and profile reads, but `syncProjectContributors` was still a stub.
- GitHub releases were not imported, and the old Locatic-authored updates surface overlapped with posts.
- The scheduled metadata refresh used an unbounded project collection read.
- High-risk public write/import paths did not have application-level rate limits.

## Chosen Fixes

- Make README URL-base fields required nullable schema keys:
  `readmeAssetBaseUrl`, `readmeAssetRootUrl`, `readmeLinkBaseUrl`, `readmeLinkRootUrl`.
- Add `internal.github.verifyProjectReadmeUrlBaseKeys` as a one-time verifier/migration that patches missing README URL-base keys to `null`.
- Remove `syncGithubStarsOnLike` from the product contract. Dev and prod user documents were cleaned with a temporary Convex cleanup transition, and the schema field is removed.
- Add `convex/lib/project_access.ts` as the shared project visibility Module and use it from public interaction paths.
- Gate `projects.refreshMetadata` by authenticated project ownership before the internal GitHub action can use the owner token.
- Implement contributor sync using GitHub contributors, `users.github.id` matching, `project_contributors` upserts/deactivation, project snapshots, and user contribution counts.
- Add `project_releases`, import GitHub releases during metadata refresh, and render releases as the release/changelog surface.
- Remove the unused Locatic-authored `updates` feature; posts remain the Locatic-authored project activity stream.
- Replace scheduled metadata refresh `.collect()` with an indexed bounded batch using `by_visible_metadata_attempted` so failed projects still make retry progress.
- Add `@convex-dev/rate-limiter` as a Convex component and apply limits to comments, reactions, DMs, repository list/import, contribution sync, and metadata refresh.

## Rollout Order

1. Deploy Convex schema/functions with the verifier available.
2. Run `internal.github.verifyProjectReadmeUrlBaseKeys` on dev and confirm `patched` is zero or expected.
3. Run the same verifier on prod.
4. Confirm Convex CLI aggregate checks report zero `syncGithubStarsOnLike` keys in dev and prod.
5. Keep the `syncGithubStarsOnLike` schema key removed.
6. Deploy the frontend release tab and local-only like contract.
7. Run or schedule metadata refreshes to populate `project_releases`.
8. Run contributor sync for target projects, then enable broader scheduled coverage if desired.

## Verification

- `pnpm exec convex codegen`
- `pnpm check`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`

## Notes

- GitHub contributors expose `contributions`; Locatic stores that as `commitCount` because GitHub’s contributors endpoint defines it as the repository contribution count.
- GitHub releases remain GitHub-authored content. Locatic-authored project activity lives in `posts`.
- README URL-base keys are required as fields but nullable as values.
