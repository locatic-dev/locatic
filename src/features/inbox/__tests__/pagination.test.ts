import { expect, it } from 'vitest'
import { mergeInboxPages } from '../pagination'

const row = (n: number) => ({ _id: String(n), _creationTime: n, updatedAt: n })

it('withholds an older prefix until both participant streams have enough rows', () => {
  const sources = [
    { results: [row(100), row(99), row(98)], status: 'CanLoadMore' },
    { results: [row(10), row(9), row(8)], status: 'CanLoadMore' },
  ]
  expect(mergeInboxPages(sources, 6).items.map((r) => r.updatedAt)).toEqual([
    100, 99, 98,
  ])
  sources[0].results.push(row(97), row(96), row(95))
  sources[1].results.push(row(7), row(6), row(5))
  expect(mergeInboxPages(sources, 6).items.map((r) => r.updatedAt)).toEqual([
    100, 99, 98, 97, 96, 95,
  ])
})

it('uses an exhausted short stream without hiding the other stream and exposes cached remainder', () => {
  const result = mergeInboxPages(
    [
      { results: [row(10), row(9), row(8)], status: 'Exhausted' },
      { results: [row(7)], status: 'Exhausted' },
    ],
    3,
  )
  expect(result.items.map((r) => r.updatedAt)).toEqual([10, 9, 8])
  expect(result.hasMore).toBe(true)
})

it('does not claim exhaustion or reveal one side during the other side’s first load', () => {
  expect(
    mergeInboxPages(
      [
        { results: [row(10)], status: 'Exhausted' },
        { results: [], status: 'LoadingFirstPage' },
      ],
      30,
    ),
  ).toEqual({ items: [], hasMore: true })
})
