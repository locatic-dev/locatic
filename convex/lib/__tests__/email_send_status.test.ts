import { describe, expect, it } from 'vitest'

import {
  nextSendStatus,
  pickReconcileRows,
  type SendStatus,
  statusFromEvent,
} from '../email_send_status'

describe('nextSendStatus', () => {
  it.each([
    ['queued', 'sent', 'sent'],
    ['sent', 'delivered', 'delivered'],
    ['queued', 'delivered', 'delivered'],
    ['delivered', 'sent', null],
    ['sent', 'sent', null],
    ['complained', 'delivered', null],
    ['bounced', 'complained', null],
    ['queued', 'failed', 'failed'],
    ['cancelled', 'sent', null],
    ['delivered', 'complained', 'complained'],
    ['delivered', 'bounced', 'bounced'],
    ['failed', 'delivered', null],
  ] as const)('%s + %s -> %s', (current, incoming, expected) => {
    expect(nextSendStatus(current as SendStatus, incoming as SendStatus)).toBe(
      expected,
    )
  })
})

describe('statusFromEvent', () => {
  it.each([
    ['email.sent', 'sent'],
    ['email.delivered', 'delivered'],
    ['email.bounced', 'bounced'],
    ['email.complained', 'complained'],
    ['email.failed', 'failed'],
    ['email.delivery_delayed', null],
    ['email.opened', null],
    ['email.clicked', null],
  ])('%s -> %s', (type, expected) => {
    expect(statusFromEvent(type)).toBe(expected)
  })
})

describe('pickReconcileRows', () => {
  const list = (prefix: string, count: number) =>
    Array.from({ length: count }, (_, index) => `${prefix}${index}`)

  it.each([
    [150, 1, 99, 1],
    [100, 100, 50, 50],
    [10, 100, 10, 90],
    [0, 3, 0, 3],
    [0, 0, 0, 0],
  ])('%i queued + %i sent -> %i + %i', (queued, sent, fromQueued, fromSent) => {
    const rows = pickReconcileRows(list('q', queued), list('s', sent), 100)
    expect(rows.filter((row) => row.startsWith('q'))).toHaveLength(fromQueued)
    expect(rows.filter((row) => row.startsWith('s'))).toHaveLength(fromSent)
    expect(rows.length).toBeLessThanOrEqual(100)
  })
})
