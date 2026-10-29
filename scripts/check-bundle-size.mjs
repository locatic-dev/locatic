#!/usr/bin/env node

import { readFileSync, readdirSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

const BUNDLE_BUDGETS = [
  {
    label: 'initial client entry',
    // Measured at ~68.5 KiB gzip; allow about 5% growth before review.
    maxGzipBytes: 72 * 1024,
    pattern: /^index-[\w-]+\.js$/,
  },
  {
    label: 'Motion feature chunk',
    // 27 KiB: with the landing's scroll parallax gone, nothing outside this
    // chunk uses motion-dom's mix, interpolate and resize helpers, so the
    // shared chunk that held them (2.2 KiB gzip) folded into this one. The
    // motion code every page loads went down by ~0.5 KiB and one request.
    maxGzipBytes: 27 * 1024,
    pattern: /^motion-features-[\w-]+\.js$/,
  },
]
// These guards throw at module scope when a VITE_ variable is missing. Vite
// inlines the missing value as undefined, so the throw becomes unconditional
// and the bundler drops every module that runs after it, including hydration.
// Such a build is small but dead, so its size is not a valid measurement.
const MISSING_ENV_MARKERS = [
  'VITE_CONVEX_URL is required',
  'Add your Clerk Publishable Key',
]
const assetsDirectory = new URL('../dist/client/assets/', import.meta.url)
const files = readdirSync(assetsDirectory)

for (const file of files.filter((name) => name.endsWith('.js'))) {
  const source = readFileSync(new URL(file, assetsDirectory), 'utf8')
  const marker = MISSING_ENV_MARKERS.find((text) => source.includes(text))

  if (marker) {
    throw new Error(
      `${file} contains "${marker}": the client was built without its VITE_ environment variables, so the bundle is not measurable. Set them (for example in .env.local) and rebuild.`,
    )
  }
}

for (const { label, maxGzipBytes, pattern } of BUNDLE_BUDGETS) {
  const matchingFiles = files.filter((file) => pattern.test(file))

  if (matchingFiles.length !== 1) {
    throw new Error(
      `Expected exactly one ${label} asset, found ${matchingFiles.length}. Run pnpm build before bundle:check.`,
    )
  }

  const [file] = matchingFiles
  const gzipBytes = gzipSync(
    readFileSync(new URL(file, assetsDirectory)),
  ).byteLength
  const gzipKiB = (gzipBytes / 1024).toFixed(2)

  console.log(`${label}: ${file} (${gzipKiB} KiB gzip)`)

  if (gzipBytes > maxGzipBytes) {
    throw new Error(
      `${label} exceeds the ${maxGzipBytes / 1024} KiB gzip budget.`,
    )
  }
}

console.log('✓ client bundle assets are within budget')
