import { createAppQueryClient } from '../convex/client'

export function getContext() {
  return createAppQueryClient()
}
