import { describe, expect, it } from 'vitest'
import { cn } from '../utils'

describe('cn', () => {
  it('lets a Locatic radius override a stock radius', () => {
    expect(cn('rounded-md', 'rounded-card')).toBe('rounded-card')
    expect(cn('rounded-card', 'rounded-control')).toBe('rounded-control')
  })

  it('lets a Locatic shadow override a stock shadow', () => {
    expect(cn('shadow-md', 'shadow-floating')).toBe('shadow-floating')
    expect(cn('shadow-card', 'shadow-none')).toBe('shadow-none')
  })

  it('keeps a text role size and a text colour together', () => {
    expect(cn('text-text-muted', 'text-meta')).toBe('text-text-muted text-meta')
    expect(cn('text-body', 'text-label')).toBe('text-label')
    expect(cn('text-eyebrow', 'text-text-muted')).toBe(
      'text-eyebrow text-text-muted',
    )
    expect(cn('text-hero', 'text-brand')).toBe('text-hero text-brand')
    expect(cn('text-meta', 'text-eyebrow')).toBe('text-eyebrow')
  })

  it('resolves conflicting semantic colours to the last one', () => {
    expect(cn('border-line', 'border-control')).toBe('border-control')
    expect(cn('bg-surface', 'bg-surface-raised')).toBe('bg-surface-raised')
    expect(cn('text-text-muted', 'text-place')).toBe('text-place')
    expect(cn('bg-success', 'bg-live')).toBe('bg-live')
  })
})
