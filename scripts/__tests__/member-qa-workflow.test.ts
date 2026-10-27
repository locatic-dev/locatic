import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

const workflow = readFileSync('.github/workflows/member-qa.yml', 'utf8')
const lines = workflow.split('\n')
const journeyStep = lines.findIndex((line) =>
  /^ {6}- name: Run prepared development journeys$/.test(line),
)
const nextStep = lines.findIndex(
  (line, index) => index > journeyStep && /^ {6}- /.test(line),
)
const journeyEnd = nextStep === -1 ? lines.length : nextStep

it('passes provider secrets only to the prepared journeys step', () => {
  expect(journeyStep).toBeGreaterThan(0)
  const secretLines = lines.flatMap((line, index) =>
    line.includes('${{ secrets.') ? [index] : [],
  )
  expect(secretLines.length).toBeGreaterThan(0)
  for (const index of secretLines) {
    expect(index).toBeGreaterThan(journeyStep)
    expect(index).toBeLessThan(journeyEnd)
  }
  const journey = lines.slice(journeyStep, journeyEnd).join('\n')
  expect(journey).toContain('CLERK_SECRET_KEY: ${{ secrets.CLERK_SECRET_KEY }}')
  expect(journey).toContain(
    'CONVEX_DEPLOY_KEY: ${{ secrets.E2E_CONVEX_DEPLOY_KEY }}',
  )
})
