import { describe, expect, it } from 'vitest'

import {
  ACCOUNT_PURGE_RETENTION_MS,
  getAccountDeletionWindow,
  shouldPurgeDeletedAccount,
} from '../account_deletion'

describe('getAccountDeletionWindow', () => {
  it('sets a 30 day purge window from the first delete request', () => {
    const now = 1_000

    expect(getAccountDeletionWindow({}, now)).toEqual({
      deletedAt: now,
      deactivatedAt: now,
      purgeAfter: now + ACCOUNT_PURGE_RETENTION_MS,
    })
  })

  it('preserves an existing deletion window', () => {
    expect(
      getAccountDeletionWindow(
        {
          deletedAt: 1_000,
          deactivatedAt: 1_100,
          purgeAfter: 2_000,
        },
        5_000,
      ),
    ).toEqual({
      deletedAt: 1_000,
      deactivatedAt: 1_100,
      purgeAfter: 2_000,
    })
  })
})

describe('shouldPurgeDeletedAccount', () => {
  it('only purges deleted accounts after the purge timestamp', () => {
    expect(
      shouldPurgeDeletedAccount(
        {
          deletedAt: 1_000,
          purgeAfter: 2_000,
          purgedAt: null,
        },
        1_999,
      ),
    ).toBe(false)

    expect(
      shouldPurgeDeletedAccount(
        {
          deletedAt: 1_000,
          purgeAfter: 2_000,
          purgedAt: null,
        },
        2_000,
      ),
    ).toBe(true)
  })

  it('does not purge active or already purged accounts', () => {
    expect(
      shouldPurgeDeletedAccount(
        {
          deletedAt: null,
          purgeAfter: 2_000,
          purgedAt: null,
        },
        3_000,
      ),
    ).toBe(false)

    expect(
      shouldPurgeDeletedAccount(
        {
          deletedAt: 1_000,
          purgeAfter: 2_000,
          purgedAt: 2_500,
        },
        3_000,
      ),
    ).toBe(false)
  })
})
