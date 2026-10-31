import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'

const routes = {
  __root__: { preloads: ['/assets/index-entry.js', '/assets/shared.js'] },
  '/': { preloads: ['/assets/routes-landing.js', '/assets/shared.js'] },
}

function runBudget({
  sharedBytes = 140_000,
  manifestRoutes = routes,
  includeManifest = true,
  missingAsset = false,
} = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'locatic-bundle-budget-'))
  try {
    for (const path of ['scripts', 'dist/client/assets', 'dist/server/assets'])
      mkdirSync(join(directory, path), { recursive: true })
    writeFileSync(join(directory, 'package.json'), '{"type":"module"}')
    const script = join(directory, 'scripts/check-bundle-size.mjs')
    writeFileSync(
      script,
      readFileSync(new URL('../check-bundle-size.mjs', import.meta.url)),
    )
    for (const name of [
      'index-entry.js',
      'routes-landing.js',
      'motion-features-main.js',
    ])
      writeFileSync(
        join(directory, 'dist/client/assets', name),
        'export const value = 1',
      )
    // Incompressible payloads keep the budget cases far from the threshold.
    const source = (bytes: number) =>
      `export const value = "${randomBytes(bytes).toString('base64')}"`
    writeFileSync(
      join(directory, 'dist/client/assets/shared.js'),
      source(sharedBytes),
    )
    writeFileSync(
      join(directory, 'dist/client/assets/lazy-unrelated.js'),
      source(350_000),
    )
    if (missingAsset)
      manifestRoutes = {
        ...manifestRoutes,
        '/': { preloads: ['/assets/missing.js'] },
      }
    if (includeManifest)
      writeFileSync(
        join(
          directory,
          'dist/server/assets/_tanstack-start-manifest-fixture.js',
        ),
        `export const tsrStartManifest = () => (${JSON.stringify({ routes: manifestRoutes })})`,
      )
    try {
      return {
        status: 0,
        output: execFileSync(process.execPath, [script], {
          cwd: directory,
          encoding: 'utf8',
          stdio: 'pipe',
        }),
      }
    } catch (error) {
      const result = error as { status: number; stdout: string; stderr: string }
      return {
        status: result.status,
        output: `${result.stdout}${result.stderr}`,
      }
    }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

it('counts shared landing preloads once and excludes unrelated lazy chunks', () => {
  const result = runBudget()
  expect(result.status).toBe(0)
  expect(result.output).toMatch(/initial landing preloads: 3 assets/)
})

it('fails when an eager shared chunk exceeds the landing budget even with a small entry', () => {
  const result = runBudget({ sharedBytes: 350_000 })
  expect(result.status).toBe(1)
  expect(result.output).toMatch(/initial landing preloads exceeds/)
})

it('fails when the build manifest is absent', () => {
  const result = runBudget({ includeManifest: false })
  expect(result.status).toBe(1)
  expect(result.output).toMatch(/Expected exactly one.*manifest/)
})

it('fails when landing preload metadata is missing', () => {
  const result = runBudget({
    manifestRoutes: { __root__: routes.__root__ } as typeof routes,
  })
  expect(result.status).toBe(1)
  expect(result.output).toMatch(/Missing.*preload/)
})

it('fails when a manifest preload does not name a built asset', () => {
  const result = runBudget({ missingAsset: true })
  expect(result.status).toBe(1)
  expect(result.output).toMatch(/Missing.*asset/)
})
