import { mkdtempSync, readdirSync, rmSync, symlinkSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, it } from 'vitest'
import { privateBaselineTemplate } from '../../playwright/fixtures/private-baselines'

const repository = resolve('.')

it('requires provider baseline storage outside the source repository', () => {
  expect(privateBaselineTemplate(undefined, repository)).toBeUndefined()
  for (const directory of [
    repository,
    join(repository, 'private-images'),
    './baselines',
  ])
    expect(() => privateBaselineTemplate(directory, repository)).toThrow()
  const external = resolve(repository, '../locatic-private-test-baselines')
  expect(privateBaselineTemplate(external, repository)).toContain(external)
})

it('rejects an external symlink that points back into the repository', () => {
  const directory = mkdtempSync(join(tmpdir(), 'locatic-baseline-policy-'))
  try {
    const alias = join(directory, 'checkout')
    symlinkSync(repository, alias, 'dir')
    expect(() =>
      privateBaselineTemplate(join(alias, 'private-images'), repository),
    ).toThrow()
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

it('has no provider-backed baseline images in the source tree', () => {
  const providerSnapshots = readdirSync('playwright').filter((name) =>
    /^visual\..*\.spec\.ts-snapshots$/.test(name),
  )
  for (const directory of providerSnapshots)
    expect(readdirSync(join('playwright', directory))).toEqual([])
})
