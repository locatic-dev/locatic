import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import {
  constants,
  copyFileSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
function check(bytes, expected, label) {
  if (!/^[a-f0-9]{64}$/.test(expected ?? '') || hash(bytes) !== expected)
    throw new Error(`SHA-256 mismatch: ${label}`)
}

let directory
try {
  const args = process.argv.slice(2)
  let manifestPath = fileURLToPath(
      new URL('../data/geonames/2026-10-23/manifest.json', import.meta.url),
    ),
    output
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--manifest') manifestPath = resolve(args[++index])
    else if (args[index] === '--output') output = resolve(args[++index])
    else if (args[index] !== '--check')
      throw new Error('Use --check, --manifest PATH or --output NEW_FILE.jsonl')
  }
  if (output && !output.endsWith('.jsonl'))
    throw new Error('Catalog output must be a new .jsonl file')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')),
    base = dirname(manifestPath)
  for (const input of Object.values(manifest.inputs)) {
    if (
      !input.file ||
      basename(input.file) !== input.file ||
      input.file === '..'
    )
      throw new Error(
        'Snapshot input must be a filename inside the manifest directory',
      )
    check(readFileSync(join(base, input.file)), input.sha256, input.file)
  }
  if (manifest.extracted.entry !== 'cities15000.txt')
    throw new Error('Unsupported archive entry')
  const raw = execFileSync(
    'unzip',
    ['-p', join(base, manifest.inputs.archive.file), manifest.extracted.entry],
    { maxBuffer: 32 * 1024 * 1024 },
  )
  check(raw, manifest.extracted.sha256, 'extracted city text')
  directory = mkdtempSync(join(tmpdir(), 'locatic-catalog-'))
  const input = join(directory, 'cities.txt'),
    generated = join(directory, 'cities.jsonl')
  writeFileSync(input, raw)
  execFileSync(
    process.execPath,
    [
      fileURLToPath(new URL('./geonames-to-cities-seed.mjs', import.meta.url)),
      '--input',
      input,
      '--admin1',
      join(base, manifest.inputs.regions.file),
      '--limit',
      String(manifest.generator.limit),
      '--timestamp',
      String(manifest.generator.timestamp),
      '--output',
      generated,
    ],
    { stdio: 'pipe' },
  )
  const bytes = readFileSync(generated)
  check(
    bytes,
    manifest.catalog.sha256,
    'generated catalog (use the Node version recorded in the manifest if ICU data differs)',
  )
  const rows = bytes.toString('utf8').trim().split('\n').length
  if (rows !== manifest.catalog.rows)
    throw new Error('Catalog row count differs from the reviewed manifest')
  if (output) copyFileSync(generated, output, constants.COPYFILE_EXCL)
  console.log(
    `Verified ${rows} GeoNames city rows, all input/output SHA-256 hashes and fixed timestamps.${output ? ` Output: ${output}` : ' No database import performed.'}`,
  )
} catch (error) {
  console.error(
    error instanceof Error ? error.message : 'Catalog verification failed',
  )
  process.exitCode = 1
} finally {
  if (directory) rmSync(directory, { recursive: true, force: true })
}
