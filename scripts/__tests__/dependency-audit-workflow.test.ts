import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'

// Execute the actual audit run block, including its shell error handling.
// actionlint separately validates the YAML/events/permissions/artifact wiring.
const workflow = readFileSync('.github/workflows/dependency-audit.yml', 'utf8')
const blocks = [...workflow.matchAll(/^ {8}run: \|\n((?: {10}.*\n)+)/gm)]
if (blocks.length !== 1) throw new Error('Expected one audit command block')
const command = blocks[0]![1]!.replace(/^ {10}/gm, '')

it.each([
  { scope: 'full', exit: 0 },
  { scope: 'production', exit: 0 },
  { scope: 'full', exit: 1 },
  { scope: 'production', exit: 1 },
  { scope: 'full', exit: 42 },
  { scope: 'production', exit: 42 },
])(
  'preserves audit status $exit and evidence for $scope',
  ({ scope, exit }) => {
    const directory = mkdtempSync(join(tmpdir(), 'locatic-dependency-audit-'))
    try {
      // One is an advisory failure; 42 stands for a registry/CLI failure.
      // No network, package installation, provider credentials or GitHub calls.
      writeFileSync(
        join(directory, 'pnpm'),
        `#!${process.execPath}
const fs = require('node:fs')
fs.writeFileSync('arguments.json', JSON.stringify(process.argv.slice(2)))
process.stdout.write(JSON.stringify({ status: Number(process.env.AUDIT_STATUS) }))
process.exitCode = Number(process.env.AUDIT_STATUS)
`,
        { mode: 0o700 },
      )
      const result = spawnSync(
        'bash',
        ['-e', '-o', 'pipefail', '-c', command],
        {
          cwd: directory,
          env: {
            ...process.env,
            PATH: `${directory}:${process.env.PATH}`,
            AUDIT_SCOPE: scope,
            AUDIT_STATUS: String(exit),
          },
          encoding: 'utf8',
        },
      )
      expect(result.error).toBeUndefined()
      expect(result.status).toBe(exit)
      expect(result.stderr).toBe('')
      expect(
        JSON.parse(readFileSync(join(directory, 'arguments.json'), 'utf8')),
      ).toEqual(
        scope === 'production'
          ? ['audit', '--prod', '--json']
          : ['audit', '--json'],
      )
      expect(
        JSON.parse(
          readFileSync(join(directory, 'dependency-audit.json'), 'utf8'),
        ),
      ).toEqual({ status: exit })
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  },
)
