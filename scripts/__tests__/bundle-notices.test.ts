import { expect, it } from 'vitest'
import { completeBundleNotices } from '../lib/bundle-notices'

const license = 'Permission is hereby granted. '.repeat(12)
const supplements = new Map([
  ['example@1.2.3 (MIT)', `${license}\nSource: pinned upstream revision`],
])
it('fills an empty version-matching notice and is idempotent', () => {
  const result = completeBundleNotices(
    '# Licenses\n\n## example - 1.2.3 (MIT)\n\n',
    supplements,
  )
  expect(result).toContain(license)
  expect(completeBundleNotices(result, supplements)).toBe(result)
})
it('preserves existing complete upstream notices byte-for-byte', () => {
  const input = `# Licenses\n\n## other - 4.5.6 (ISC)\n\n${license}\n`
  expect(completeBundleNotices(input, supplements)).toBe(input)
})
it.each([
  'example - 1.2.4 (MIT)',
  'example - 1.2.3 (ISC)',
  'unknown - 1.0.0 (MIT)',
])('fails closed when %s lacks a reviewed version/license match', (heading) => {
  expect(() =>
    completeBundleNotices(`# Licenses\n\n## ${heading}\n\n`, supplements),
  ).toThrow(/missing.*license/i)
})
