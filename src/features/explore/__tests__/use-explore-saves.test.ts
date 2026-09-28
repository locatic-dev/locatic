import { describe, expect, it } from 'vitest'

import {
  chunkSavedStateIds,
  SAVED_STATE_CHUNK_SIZE,
} from '../use-explore-saves'

describe('chunkSavedStateIds', () => {
  it('asks for at most 40 ids per saved-state call', () => {
    const ids = Array.from({ length: 95 }, (_, index) => `project_${index}`)
    const chunks = chunkSavedStateIds(ids)

    expect(chunks.map((chunk) => chunk.length)).toEqual([40, 40, 15])
    expect(
      chunks.every((chunk) => chunk.length <= SAVED_STATE_CHUNK_SIZE),
    ).toBe(true)
    expect(chunks.flat()).toEqual(ids)
  })

  it('fills chunks in load order and drops repeated ids', () => {
    const firstPage = Array.from({ length: 20 }, (_, index) => `p${index}`)
    const twoPages = [
      ...firstPage,
      ...Array.from({ length: 30 }, (_, index) => `q${index}`),
    ]

    expect(chunkSavedStateIds(twoPages)[0]).toEqual([
      ...firstPage,
      ...twoPages.slice(20, 40),
    ])
    expect(chunkSavedStateIds([...firstPage, ...firstPage])).toEqual([
      firstPage,
    ])
    expect(chunkSavedStateIds([])).toEqual([])
  })
})
