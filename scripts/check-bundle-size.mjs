#!/usr/bin/env node

import { readFileSync, readdirSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

const BUNDLE_BUDGETS = [
  {
    label: 'initial client entry',
    maxGzipBytes: 85 * 1024,
    pattern: /^index-[\w-]+\.js$/,
  },
  {
    label: 'Motion feature chunk',
    maxGzipBytes: 24 * 1024,
    pattern: /^motion-features-[\w-]+\.js$/,
  },
]
const assetsDirectory = new URL('../dist/client/assets/', import.meta.url)
const files = readdirSync(assetsDirectory)

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
