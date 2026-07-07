import { describe, expect, it } from 'vitest'

import {
  getNextPostSearchLimit,
  POST_SEARCH_DEFAULT_LIMIT,
  POST_SEARCH_LIMIT_STEP,
} from '../post-search'

describe('post search pagination', () => {
  it('increments the search limit separately from browse pagination', () => {
    expect(getNextPostSearchLimit(POST_SEARCH_DEFAULT_LIMIT)).toBe(
      POST_SEARCH_DEFAULT_LIMIT + POST_SEARCH_LIMIT_STEP,
    )
  })
})
