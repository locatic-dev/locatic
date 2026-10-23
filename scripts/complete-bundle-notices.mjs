import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { basename } from 'node:path'
import { completeBundleNotices } from './lib/bundle-notices.ts'

const root = new URL('../', import.meta.url)
const manifest = JSON.parse(
  readFileSync(new URL('data/licenses/manifest.json', root), 'utf8'),
)
const supplements = new Map()
for (const entry of manifest.entries) {
  if (
    !entry.file ||
    basename(entry.file) !== entry.file ||
    entry.file === '..' ||
    !/^https:\/\/raw\.githubusercontent\.com\//.test(entry.source)
  )
    throw new Error('Invalid license supplement provenance')
  const text = readFileSync(
    new URL(`data/licenses/${entry.file}`, root),
    'utf8',
  )
  if (createHash('sha256').update(text).digest('hex') !== entry.sha256)
    throw new Error('License supplement SHA-256 mismatch')
  supplements.set(
    `${entry.package}@${entry.version} (${entry.declaredLicense})`,
    `${text.trim()}\n\nUpstream notice: ${entry.source}\n\nSource scope: ${entry.sourceRevisionRelation}`,
  )
}
// Validate both before replacing either generated build report.
const outputs = [
  'dist/client/.vite/license.md',
  'dist/server/.vite/license.md',
].map((path) => {
  const file = new URL(path, root)
  return {
    file,
    text: completeBundleNotices(readFileSync(file, 'utf8'), supplements),
  }
})
for (const output of outputs) writeFileSync(output.file, output.text)
console.log(
  'Browser and Worker license reports contain full texts; reviewed supplements match pinned versions and SHA-256 hashes.',
)
