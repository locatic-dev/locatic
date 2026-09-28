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
import type * as homeBackfill from "../homeBackfill.js";
import type * as http from "../http.js";
import type * as lib_account_deletion from "../lib/account_deletion.js";
import type * as lib_activity from "../lib/activity.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_citySearch from "../lib/citySearch.js";
import type * as lib_cityStats from "../lib/cityStats.js";
import type * as lib_cleanup from "../lib/cleanup.js";
import type * as lib_clerk from "../lib/clerk.js";
import type * as lib_constants from "../lib/constants.js";
import type * as lib_conversation from "../lib/conversation.js";
import type * as lib_discoverability from "../lib/discoverability.js";
import type * as lib_explore from "../lib/explore.js";
import type * as lib_geo from "../lib/geo.js";
import type * as lib_github from "../lib/github.js";
import type * as lib_github_identity from "../lib/github_identity.js";
import type * as lib_homeFeed from "../lib/homeFeed.js";
import type * as lib_notifications from "../lib/notifications.js";
import type * as lib_post_counts from "../lib/post_counts.js";
import type * as lib_posts from "../lib/posts.js";
import type * as lib_privacy from "../lib/privacy.js";
import type * as lib_project_access from "../lib/project_access.js";
import type * as lib_project_contributor_sync from "../lib/project_contributor_sync.js";
import type * as lib_project_pins from "../lib/project_pins.js";
import type * as lib_project_previews from "../lib/project_previews.js";
import type * as lib_project_reactions from "../lib/project_reactions.js";
import type * as lib_project_route from "../lib/project_route.js";
import type * as lib_pulse from "../lib/pulse.js";
import type * as lib_rate_limits from "../lib/rate_limits.js";
import type * as lib_reaction_config from "../lib/reaction_config.js";
import type * as lib_reactions from "../lib/reactions.js";
import type * as lib_snapshots from "../lib/snapshots.js";
import type * as lib_topics from "../lib/topics.js";
import type * as lib_types from "../lib/types.js";
import type * as lib_user_github_id_backfill from "../lib/user_github_id_backfill.js";
import type * as lib_validators from "../lib/validators.js";
import type * as lib_viewer from "../lib/viewer.js";
import type * as lib_visibility from "../lib/visibility.js";
import type * as lib_webhook_events from "../lib/webhook_events.js";
import type * as metrics from "../metrics.js";
import type * as notifications from "../notifications.js";
import type * as posts from "../posts.js";
import type * as projects from "../projects.js";
import type * as pulse from "../pulse.js";
import type * as reactionConfigSeed from "../reactionConfigSeed.js";
import type * as reactions from "../reactions.js";
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
  homeBackfill: typeof homeBackfill;
  http: typeof http;
  "lib/account_deletion": typeof lib_account_deletion;
  "lib/activity": typeof lib_activity;
  "lib/auth": typeof lib_auth;
  "lib/citySearch": typeof lib_citySearch;
  "lib/cityStats": typeof lib_cityStats;
  "lib/cleanup": typeof lib_cleanup;
  "lib/clerk": typeof lib_clerk;
  "lib/constants": typeof lib_constants;
  "lib/conversation": typeof lib_conversation;
  "lib/discoverability": typeof lib_discoverability;
  "lib/explore": typeof lib_explore;
  "lib/geo": typeof lib_geo;
  "lib/github": typeof lib_github;
  "lib/github_identity": typeof lib_github_identity;
  "lib/homeFeed": typeof lib_homeFeed;
  "lib/notifications": typeof lib_notifications;
  "lib/post_counts": typeof lib_post_counts;
  "lib/posts": typeof lib_posts;
  "lib/privacy": typeof lib_privacy;
  "lib/project_access": typeof lib_project_access;
  "lib/project_contributor_sync": typeof lib_project_contributor_sync;
  "lib/project_pins": typeof lib_project_pins;
  "lib/project_previews": typeof lib_project_previews;
  "lib/project_reactions": typeof lib_project_reactions;
  "lib/project_route": typeof lib_project_route;
  "lib/pulse": typeof lib_pulse;
  "lib/rate_limits": typeof lib_rate_limits;
  "lib/reaction_config": typeof lib_reaction_config;
  "lib/reactions": typeof lib_reactions;
  "lib/snapshots": typeof lib_snapshots;
  "lib/topics": typeof lib_topics;
  "lib/types": typeof lib_types;
  "lib/user_github_id_backfill": typeof lib_user_github_id_backfill;
  "lib/validators": typeof lib_validators;
  "lib/viewer": typeof lib_viewer;
  "lib/visibility": typeof lib_visibility;
  "lib/webhook_events": typeof lib_webhook_events;
  metrics: typeof metrics;
  notifications: typeof notifications;
  posts: typeof posts;
  projects: typeof projects;
  pulse: typeof pulse;
  reactionConfigSeed: typeof reactionConfigSeed;
  reactions: typeof reactions;
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

export declare const components: {
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
};
