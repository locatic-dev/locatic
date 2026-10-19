import { describe, expect, it } from 'vitest'
import { describeCity, topCityLanguages } from '../city-summary'

describe('topCityLanguages', () => {
  it('counts primary languages, most common first, ties by name', () => {
    expect(
      topCityLanguages(
        ['TypeScript', 'Go', 'TypeScript', 'Python', 'Go', 'TypeScript', null]
          .concat(['Rust'])
          .map((primaryLanguage) => ({ primaryLanguage })),
      ),
    ).toEqual(['TypeScript', 'Go', 'Python'])
  })
})

describe('describeCity', () => {
  it('describes builders, projects, languages and last activity', () => {
    expect(
      describeCity({
        name: 'Bengaluru',
        stats: {
          builderCount: 12,
          projectCount: 34,
          lastActivityAt: Date.UTC(2026, 9, 15, 23, 30),
        },
        languages: ['TypeScript', 'Go', 'Python'],
      }),
    ).toBe(
      '12 builders in Bengaluru share 34 public projects on Locatic. Recent work is mostly TypeScript, Go and Python. Last activity: Oct 15, 2026.',
    )
  })

  it('uses singular forms and leaves out what is unknown', () => {
    expect(
      describeCity({
        name: 'Kolkata',
        stats: { builderCount: 1, projectCount: 1, lastActivityAt: null },
        languages: [],
      }),
    ).toBe('1 builder in Kolkata shares 1 public project on Locatic.')
  })

  it('says so when a city has no counted builders', () => {
    expect(
      describeCity({
        name: 'Mysuru',
        stats: { builderCount: 0, projectCount: 0, lastActivityAt: null },
        languages: [],
      }),
    ).toBe('No builders in Mysuru share public work on Locatic yet.')
  })
})
