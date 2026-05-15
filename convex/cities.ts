import { internalMutation, query } from './_generated/server'
import { v } from 'convex/values'

import { DEFAULT_CITIES } from './citiesSeed'

export const search = query({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 10, 20)
    const normalizedQuery = args.query.trim().toLowerCase()

    const cities = await ctx.db.query('cities').withIndex('by_name').collect()

    const activeCities = cities.filter((city) => city.isActive)
    if (!normalizedQuery) {
      return activeCities.slice(0, limit)
    }

    return activeCities
      .filter((city) => {
        if (city.normalizedName.includes(normalizedQuery)) {
          return true
        }

        return city.aliases.some((alias) =>
          alias.toLowerCase().includes(normalizedQuery),
        )
      })
      .slice(0, limit)
  },
})

export const listPopular = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query('cities').withIndex('by_name').take(20)
  },
})

export const seedDefaultCities = internalMutation({
  args: {},
  handler: async (ctx) => {
    let created = 0
    const now = Date.now()

    for (const city of DEFAULT_CITIES) {
      const existing = await ctx.db
        .query('cities')
        .withIndex('by_slug', (query) => query.eq('slug', city.slug))
        .unique()

      if (existing) {
        continue
      }

      await ctx.db.insert('cities', {
        slug: city.slug,
        name: city.name,
        displayName: city.displayName,
        normalizedName: city.displayName.toLowerCase(),
        region: city.region,
        country: city.country,
        countryCode: city.countryCode,
        location: {
          lat: city.lat,
          lng: city.lng,
        },
        address: city.address,
        aliases: city.aliases,
        timezone: city.timezone,
        searchText: [city.displayName, city.name, ...city.aliases].join(' '),
        isActive: true,
        createdAt: now,
        updatedAt: now,
      })

      created += 1
    }

    return { created }
  },
})
