import { describe, expect, it } from 'vitest'

import { extractContributionCalendar } from '../github'

describe('extractContributionCalendar', () => {
  it('returns null when GitHub responds without a user payload', () => {
    expect(extractContributionCalendar({ user: null })).toBeNull()
  })

  it('maps GitHub contribution weeks into the stored shape', () => {
    expect(
      extractContributionCalendar({
        user: {
          contributionsCollection: {
            contributionCalendar: {
              totalContributions: 12,
              weeks: [
                {
                  contributionDays: [
                    { contributionCount: 3, date: '2026-05-01' },
                    { contributionCount: 0, date: '2026-05-02' },
                  ],
                },
              ],
            },
          },
        },
      }),
    ).toEqual({
      totalContributions: 12,
      weeks: [
        {
          days: [
            { count: 3, date: '2026-05-01' },
            { count: 0, date: '2026-05-02' },
          ],
        },
      ],
    })
  })
})
