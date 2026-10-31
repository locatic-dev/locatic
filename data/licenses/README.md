# Bundle license supplements

Vite's license report has empty license-text sections for eleven currently bundled package versions because their npm archives omit the corresponding license file. The manifest pins those exact package versions, declared SPDX expression, upstream text URL and SHA-256. `pnpm notices:complete` fills only those reviewed gaps in generated browser/Worker reports and fails on an unknown version/license or missing text. It runs as part of `pnpm ci:build`, performs no network access and preserves complete notices already emitted by Vite.

The nine Radix notices use the MIT license at their published npm Git commit. The Cloudflare preset uses the MIT option from its version-matching release tag (dereferenced to a commit). Both include their original copyright statements.

**Historical provenance limit:** `react-remove-scroll-bar@2.3.8` declares MIT in npm metadata, but its published `gitHead` returns 404 from the author's repository and no matching release tag is available. Its supplement preserves the author's current upstream MIT notice at a pinned commit, including the 2025 copyright and email. This does not establish that the historical release used the same copyright notice. Ask the upstream maintainer/owner to confirm the historical notice before asserting complete legal clearance. Do not replace the author/date with a guessed sibling-package notice.

These files supplement the actual build reports; they are not an all-dependency license clearance or a license change for upstream software. Retain applicable package notices with the distributed artifacts, and review native/dev-container contents separately if those are distributed.
