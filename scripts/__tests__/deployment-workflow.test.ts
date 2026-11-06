import { execFileSync, spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'

const workflow = readFileSync('.github/workflows/convex-deploy.yml', 'utf8')
const jobs = workflow
  .split(/^ {2}deploy-(?:development|production):\n/m)
  .slice(1)
const commands = [...workflow.matchAll(/^ {8}run: \|\n((?: {10}.*\n)+)/gm)].map(
  (match) => match[1]!.replace(/^ {10}/gm, ''),
)

function verifyRevision(command: string, revision: string) {
  const directory = mkdtempSync(join(tmpdir(), 'locatic-deploy-revision-'))
  const git = (...args: string[]) =>
    execFileSync(
      'git',
      [
        '-c',
        'user.name=Fixture',
        '-c',
        'user.email=fixture@example.invalid',
        '-c',
        'commit.gpgsign=false',
        '-c',
        'core.hooksPath=/dev/null',
        ...args,
      ],
      { cwd: directory, encoding: 'utf8', stdio: 'pipe' },
    ).trim()
  try {
    git('init', '--quiet')
    writeFileSync(join(directory, 'revision.txt'), 'first')
    git('add', 'revision.txt')
    git('commit', '--quiet', '-m', 'first')
    const previous = git('rev-parse', 'HEAD')
    writeFileSync(join(directory, 'revision.txt'), 'second')
    git('commit', '--quiet', '-am', 'second')
    const current = git('rev-parse', 'HEAD')
    const expected =
      revision === 'current'
        ? current
        : revision === 'previous'
          ? previous
          : revision
    const result = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', command], {
      cwd: directory,
      env: { ...process.env, EXPECTED_SHA: expected },
      encoding: 'utf8',
    })
    expect(existsSync(join(directory, 'injected'))).toBe(false)
    expect(result.error).toBeUndefined()
    return result
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

it('keeps provider credentials out of checkout, installation, and builds', () => {
  expect(jobs).toHaveLength(2)
  for (const job of jobs) {
    const deployment = job.indexOf('      - name: Deploy Convex')
    expect(deployment).toBeGreaterThan(0)
    expect(job.slice(0, deployment)).not.toContain('${{ secrets.')
    expect(job.slice(deployment)).toContain('${{ secrets.CONVEX_DEPLOY_KEY }}')
    expect(job.slice(deployment)).toContain(
      '${{ secrets.CLOUDFLARE_API_TOKEN }}',
    )
  }
})

it('checks the revision before installation in both deployment jobs', () => {
  expect(commands).toHaveLength(2)
  for (const job of jobs)
    expect(job.indexOf('      - name: Verify CI revision')).toBeLessThan(
      job.indexOf('      - name: Install dependencies'),
    )
})

it.each(['development', 'production'])(
  '%s accepts only the tested revision',
  (target) => {
    const command = commands[target === 'development' ? 0 : 1]!
    expect(verifyRevision(command, 'current').status).toBe(0)
    for (const revision of ['previous', '', '$(touch injected)']) {
      const result = verifyRevision(command, revision)
      expect(result.status).toBe(1)
      expect(result.stdout).toContain(
        'no longer matches the successful CI revision',
      )
    }
  },
)
