/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from 'convex/server'
import type * as cities from '../cities.js'
import type * as cleanup from '../cleanup.js'
import type * as comments from '../comments.js'
import type * as conversations from '../conversations.js'
import type * as explore from '../explore.js'
import type * as follows from '../follows.js'
import type * as github from '../github.js'
import type * as github_actions from '../github_actions.js'
import type * as home from '../home.js'
import type * as notifications from '../notifications.js'
import type * as projects from '../projects.js'
import type * as pulse from '../pulse.js'
import type * as reactions from '../reactions.js'
import type * as updates from '../updates.js'
import type * as users from '../users.js'

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  cities: typeof cities
  cleanup: typeof cleanup
  comments: typeof comments
  conversations: typeof conversations
  explore: typeof explore
  follows: typeof follows
  github: typeof github
  github_actions: typeof github_actions
  home: typeof home
  notifications: typeof notifications
  projects: typeof projects
  pulse: typeof pulse
  reactions: typeof reactions
  updates: typeof updates
  users: typeof users
}>
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, 'public'>
>
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, 'internal'>
>
