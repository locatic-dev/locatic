import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'
import { query } from './_generated/server'
import { readActiveMapCities } from './cities'
import { isProfileGone, isProfileOpenToSignedOutVisitors } from './lib/privacy'
import { resolveProjectOwnerLogin } from './lib/project_route'

/**
 * Largest page the sitemap queries read. Project documents carry a README
 * preview of up to 20,000 characters, so pages stay small enough to keep each
 * query well inside Convex's per-transaction read limit.
 */
export const SITEMAP_PAGE_SIZE = 200

const sitemapEntryValidator = v.object({
  path: v.string(),
  updatedAt: v.union(v.number(), v.null()),
})

const sitemapPageValidator = v.object({
  entries: v.array(sitemapEntryValidator),
  continueCursor: v.string(),
  isDone: v.boolean(),
})

function boundedPage(paginationOpts: {
  numItems: number
  cursor: string | null
}) {
  return {
    ...paginationOpts,
    numItems: Math.min(Math.max(paginationOpts.numItems, 1), SITEMAP_PAGE_SIZE),
  }
}

// /sitemap.xml lists only pages a signed-out visitor can open; the route in
// src/routes/sitemap[.]xml.ts walks these pages.

/** Active cities with builders. */
export const cities = query({
  args: {},
  returns: v.array(sitemapEntryValidator),
  handler: async (ctx) =>
    (await readActiveMapCities(ctx.db)).map((city) => ({
      path: `/c/${city.slug}`,
      updatedAt: null,
    })),
})

/**
 * Visible projects whose owner's account is active, newest first. Project
 * pages are public whatever the owner's profile visibility
 * (`getPublicProjectDetail`).
 */
export const projects = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: sitemapPageValidator,
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query('projects')
      .withIndex('by_visible_added', (query) =>
        query.eq('locatic.isVisible', true),
      )
      .order('desc')
      .paginate(boundedPage(args.paginationOpts))

    const ownerIds = [...new Set(result.page.map((project) => project.ownerId))]
    const activeOwnerIds = new Set(
      (await Promise.all(ownerIds.map((id) => ctx.db.get(id)))).flatMap(
        (owner) => (owner && !isProfileGone(owner) ? [owner._id] : []),
      ),
    )

    return {
      entries: result.page
        .filter((project) => activeOwnerIds.has(project.ownerId))
        .map((project) => ({
          path: `/project/${resolveProjectOwnerLogin(project)}/${project.github.name}`,
          updatedAt: project.updatedAt,
        })),
      continueCursor: result.continueCursor,
      isDone: result.isDone,
    }
  },
})

/**
 * Onboarded builders whose profile a signed-out visitor can open
 * (`getAccessiblePublicProfileViewer`); `locatic_only` profiles stay out.
 */
export const profiles = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: sitemapPageValidator,
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query('users')
      .withIndex('by_created_at')
      .paginate(boundedPage(args.paginationOpts))

    return {
      entries: result.page
        .filter(
          (user) =>
            user.onboardingCompletedAt &&
            isProfileOpenToSignedOutVisitors(user),
        )
        .map((user) => ({
          path: `/u/${user.github.username}`,
          updatedAt: user.updatedAt,
        })),
      continueCursor: result.continueCursor,
      isDone: result.isDone,
    }
  },
})
