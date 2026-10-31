import type { FunctionReturnType } from 'convex/server'
import type { api } from '../../../convex/_generated/api'

/** A public city page as `api.cities.getPage` returns it. */
export type CityPagePayload = NonNullable<
  FunctionReturnType<typeof api.cities.getPage>
>

export type CityPageBuilder = CityPagePayload['builders'][number]
export type CityPagePost = CityPagePayload['posts'][number]
export type NearbyCity = CityPagePayload['nearby'][number]
