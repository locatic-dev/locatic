import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, it } from 'vitest'

it('executes each bundled read-only query and writes a counts-only report without overwriting evidence', () => {
  const directory = mkdtempSync(join(tmpdir(), 'locatic-audit-cli-'))
  try {
    // Execute the complete generated query against an empty database seam.
    // No Convex credentials or network are involved in this CLI contract test.
    writeFileSync(
      join(directory, 'pnpm'),
      `#!/usr/bin/env node
const args = process.argv.slice(2)
if (args[0] !== 'exec' || args[1] !== 'convex' || args[2] !== 'run' || args.includes('--push') || !args.includes('--inline-query')) process.exit(2)
const source = args[args.indexOf('--inline-query') + 1]
const page = async (options) => {
  if (options.numItems !== 25 || options.maximumRowsRead !== 25 || options.maximumBytesRead !== 128000) throw new Error('Unbounded audit')
  return { page: [], isDone: true, continueCursor: '' }
}
const db = { query: () => ({ paginate: page }), system: { query: () => ({ paginate: page }) } }
new (Object.getPrototypeOf(async function(){}).constructor)('ctx', source)({ db }).then(value => process.stdout.write(JSON.stringify(value))).catch(() => process.exit(3))
`,
      { mode: 0o700 },
    )
    const output = join(directory, 'evidence.json')
    const args = [
      resolve('scripts/oss-readiness-audit.mjs'),
      '--deployment',
      'example-development-123',
      '--output',
      output,
    ]
    const options = {
      env: { ...process.env, PATH: `${directory}:${process.env.PATH}` },
      encoding: 'utf8' as const,
      stdio: 'pipe' as const,
    }
    execFileSync(process.execPath, args, options)
    const report = JSON.parse(readFileSync(output, 'utf8'))
    expect(Object.keys(report.scanned)).toHaveLength(9)
    expect(report.counterMismatches).toEqual({
      cities: 0,
      userPosts: 0,
      projectPosts: 0,
    })
    expect(report.eligibleForRetirement).toBe(false)
    expect(report.observationsOnly).toBe(true)
    expect(() => execFileSync(process.execPath, args, options)).toThrow()
    expect(JSON.parse(readFileSync(output, 'utf8'))).toEqual(report)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
