import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { build } from 'vite'

const execute = promisify(execFile)
const tables = [
  'users',
  'projects',
  'posts',
  'cities',
  'reaction_config',
  'notifications',
  'home_feed_items',
  'pulse_snapshots',
  'scheduled',
]
const pairs = ['expectedCities', 'storedCities'],
  numbers = [
    'expectedUserPosts',
    'storedUserPosts',
    'expectedProjectPosts',
    'storedProjectPosts',
  ]
const counts = () =>
  Object.fromEntries([...pairs, ...numbers].map((name) => [name, {}]))
const mismatches = (expected, stored) =>
  [...new Set([...Object.keys(expected), ...Object.keys(stored)])].filter(
    (id) =>
      JSON.stringify(expected[id] ?? 0) !== JSON.stringify(stored[id] ?? 0),
  ).length

try {
  const args = process.argv.slice(2)
  let deployment,
    output,
    plan = false
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--deployment') deployment = args[++index]
    else if (args[index] === '--output') output = args[++index]
    else if (args[index] === '--plan') plan = true
    else
      throw new Error(
        'Use --deployment EXACT_NAME and --output NEW_REPORT.json (or --plan)',
      )
  }
  if (!deployment || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/.test(deployment))
    throw new Error(
      'Select an explicit deployment name; dev/prod aliases are refused',
    )
  if (!plan && (!output || existsSync(output)))
    throw new Error(
      'Choose a new output file; existing files are never overwritten',
    )
  const result = await build({
    configFile: false,
    envDir: false,
    publicDir: false,
    logLevel: 'error',
    build: {
      write: false,
      minify: false,
      lib: {
        entry: fileURLToPath(
          new URL('../convex/lib/readiness_audit.ts', import.meta.url),
        ),
        formats: ['iife'],
        name: 'LocaticReadinessAudit',
      },
    },
  })
  const bundle = (Array.isArray(result) ? result[0] : result).output.find(
    (item) => item.type === 'chunk',
  ).code
  if (bundle.length > 100_000)
    throw new Error(
      'Read-only audit bundle unexpectedly exceeds the reviewed size limit',
    )
  const querySha256 = createHash('sha256').update(bundle).digest('hex')
  if (plan) {
    console.log(
      JSON.stringify(
        {
          deployment,
          mode: 'server-enforced read-only inline query',
          pageRows: 25,
          maximumPageBytes: 128000,
          tables,
          querySha256,
          queryBytes: Buffer.byteLength(bundle),
        },
        null,
        2,
      ),
    )
  } else {
    const report = {
      deployment,
      startedAt: new Date().toISOString(),
      querySha256,
      observationsOnly: true,
      eligibleForRetirement: false,
      scanned: {},
      issues: {},
    }
    const aggregate = counts()
    for (const table of tables) {
      let cursor = null,
        complete = false
      for (let page = 0; page < 100_000; page++) {
        const query = `${bundle}\nreturn await LocaticReadinessAudit.auditReadinessPage(ctx, ${JSON.stringify({ table, cursor })})`
        const { stdout } = await execute(
          'pnpm',
          [
            'exec',
            'convex',
            'run',
            '--deployment',
            deployment,
            '--inline-query',
            query,
          ],
          {
            timeout: 60_000,
            maxBuffer: 2_000_000,
            env: { ...process.env, NO_COLOR: '1' },
          },
        )
        const result = JSON.parse(stdout)
        report.scanned[table] = (report.scanned[table] ?? 0) + result.scanned
        for (const [name, count] of Object.entries(result.issues))
          report.issues[name] = (report.issues[name] ?? 0) + count
        for (const key of numbers)
          for (const [id, count] of Object.entries(result[key]))
            aggregate[key][id] = (aggregate[key][id] ?? 0) + count
        for (const key of pairs)
          for (const [id, pair] of Object.entries(result[key])) {
            const stored = aggregate[key][id] ?? {
              builderCount: 0,
              projectCount: 0,
            }
            aggregate[key][id] = {
              builderCount: stored.builderCount + pair.builderCount,
              projectCount: stored.projectCount + pair.projectCount,
            }
          }
        if (result.isDone) {
          complete = true
          break
        }
        if (result.continueCursor === cursor)
          throw new Error('Audit cursor did not advance')
        cursor = result.continueCursor
      }
      if (!complete)
        throw new Error(
          'Audit page limit reached; no completion claim is available',
        )
    }
    for (const id of new Set([
      ...Object.keys(aggregate.expectedCities),
      ...Object.keys(aggregate.storedCities),
    ])) {
      aggregate.expectedCities[id] ??= { builderCount: 0, projectCount: 0 }
      aggregate.storedCities[id] ??= { builderCount: 0, projectCount: 0 }
    }
    report.counterMismatches = {
      cities: mismatches(aggregate.expectedCities, aggregate.storedCities),
      userPosts: mismatches(
        aggregate.expectedUserPosts,
        aggregate.storedUserPosts,
      ),
      projectPosts: mismatches(
        aggregate.expectedProjectPosts,
        aggregate.storedProjectPosts,
      ),
    }
    report.finishedAt = new Date().toISOString()
    report.limitations =
      'Pages are individual consistent reads, not one global snapshot. Recheck under a controlled quiet window and record deployed revision, completed migration cursors/jobs, data-retention decision and backup/rollback evidence before retirement. No data changed; report contains counts only.'
    writeFileSync(output, JSON.stringify(report, null, 2) + '\n', {
      flag: 'wx',
      mode: 0o600,
    })
    console.log(
      `Read-only counts saved to ${output}. No migration/deployment performed; this report alone cannot authorize retirement.`,
    )
  }
} catch {
  // Convex CLI errors may contain account context. Keep provider output private.
  console.error(
    'Readiness audit did not complete. Check explicit deployment selection, existing CLI read access and the chosen new output path. No mutation or deployment command is used.',
  )
  process.exitCode = 1
}
