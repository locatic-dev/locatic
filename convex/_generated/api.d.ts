/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as cities from "../cities.js";
import type * as citiesSeed from "../citiesSeed.js";
import type * as cleanup from "../cleanup.js";
import type * as comments from "../comments.js";
import type * as conversations from "../conversations.js";
import type * as crons from "../crons.js";
import type * as explore from "../explore.js";
import type * as follows from "../follows.js";
import type * as github from "../github.js";
import type * as github_actions from "../github_actions.js";
import type * as home from "../home.js";
import type * as http from "../http.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_cleanup from "../lib/cleanup.js";
import type * as lib_constants from "../lib/constants.js";
import type * as lib_conversation from "../lib/conversation.js";
import type * as lib_discoverability from "../lib/discoverability.js";
import type * as lib_explore from "../lib/explore.js";
import type * as lib_github from "../lib/github.js";
import type * as lib_homeFeed from "../lib/homeFeed.js";
import type * as lib_notifications from "../lib/notifications.js";
import type * as lib_project_pins from "../lib/project_pins.js";
import type * as lib_project_previews from "../lib/project_previews.js";
import type * as lib_pulse from "../lib/pulse.js";
import type * as lib_snapshots from "../lib/snapshots.js";
import type * as lib_types from "../lib/types.js";
import type * as lib_validators from "../lib/validators.js";
import type * as lib_viewer from "../lib/viewer.js";
import type * as notifications from "../notifications.js";
import type * as projects from "../projects.js";
import type * as pulse from "../pulse.js";
import type * as reactionConfigSeed from "../reactionConfigSeed.js";
import type * as reactions from "../reactions.js";
import type * as updates from "../updates.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  cities: typeof cities;
  citiesSeed: typeof citiesSeed;
  cleanup: typeof cleanup;
  comments: typeof comments;
  conversations: typeof conversations;
  crons: typeof crons;
  explore: typeof explore;
  follows: typeof follows;
  github: typeof github;
  github_actions: typeof github_actions;
  home: typeof home;
  http: typeof http;
  "lib/auth": typeof lib_auth;
  "lib/cleanup": typeof lib_cleanup;
  "lib/constants": typeof lib_constants;
  "lib/conversation": typeof lib_conversation;
  "lib/discoverability": typeof lib_discoverability;
  "lib/explore": typeof lib_explore;
  "lib/github": typeof lib_github;
  "lib/homeFeed": typeof lib_homeFeed;
  "lib/notifications": typeof lib_notifications;
  "lib/project_pins": typeof lib_project_pins;
  "lib/project_previews": typeof lib_project_previews;
  "lib/pulse": typeof lib_pulse;
  "lib/snapshots": typeof lib_snapshots;
  "lib/types": typeof lib_types;
  "lib/validators": typeof lib_validators;
  "lib/viewer": typeof lib_viewer;
  notifications: typeof notifications;
  projects: typeof projects;
  pulse: typeof pulse;
  reactionConfigSeed: typeof reactionConfigSeed;
  reactions: typeof reactions;
  updates: typeof updates;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
