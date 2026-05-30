#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const GEONAMES_COLUMNS = {
  geonameId: 0,
  name: 1,
  asciiName: 2,
  alternateNames: 3,
  latitude: 4,
  longitude: 5,
  featureClass: 6,
  featureCode: 7,
  countryCode: 8,
  admin1Code: 10,
  population: 14,
  timezone: 17,
}

const INCLUDED_FEATURE_CODES = new Set([
  'PPLC',
  'PPLA',
  'PPLA2',
  'PPLA3',
  'PPLA4',
  'PPL',
  'PPLG',
])

function parseArgs(argv) {
  const args = {
    input: '',
    output: '',
    limit: 200,
    countries: null,
    admin1: '',
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--input') args.input = argv[index + 1] ?? ''
    if (arg === '--output') args.output = argv[index + 1] ?? ''
    if (arg === '--limit') args.limit = Number(argv[index + 1] ?? '200')
    if (arg === '--countries') {
      args.countries = (argv[index + 1] ?? '')
        .split(',')
        .map((value) => value.trim().toUpperCase())
        .filter(Boolean)
    }
    if (arg === '--admin1') args.admin1 = argv[index + 1] ?? ''
  }

  if (!args.input) {
    throw new Error(
      'Missing --input. Download cities500.txt or cities1000.txt from https://download.geonames.org/export/dump/ and pass its path here.',
    )
  }

  return args
}

const countryNames = new Intl.DisplayNames(['en'], { type: 'region' })

function normalizeName(value) {
  return value
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
}

function slugifyCity(name, countryCode) {
  return `${normalizeName(name)
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')}-${countryCode.toLowerCase()}`
}

function titleCaseSegment(value) {
  return value
    .toLowerCase()
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((segment) => segment[0]?.toUpperCase() + segment.slice(1))
    .join(' ')
}

function buildAdmin1Lookup(raw) {
  const lookup = new Map()
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    const [key, name] = line.split('\t')
    if (!key || !name) continue
    lookup.set(key.trim(), name.trim())
  }
  return lookup
}

function toAliasList(name, asciiName, alternateNames) {
  const base = new Set()
  for (const candidate of [asciiName, ...alternateNames.split(',')]) {
    const trimmed = candidate.trim()
    if (!trimmed) continue
    if (trimmed.toLowerCase() === name.toLowerCase()) continue
    if (trimmed.length < 3) continue
    base.add(trimmed.toLowerCase())
    if (base.size >= 8) break
  }
  return [...base].sort((left, right) => left.localeCompare(right))
}

function toSeedCity(line, admin1Lookup) {
  const columns = line.split('\t')
  if (!columns[GEONAMES_COLUMNS.name]) return null
  if (columns[GEONAMES_COLUMNS.featureClass] !== 'P') return null

  const featureCode = columns[GEONAMES_COLUMNS.featureCode]
  if (!INCLUDED_FEATURE_CODES.has(featureCode)) return null

  const name = columns[GEONAMES_COLUMNS.name]
  const asciiName = columns[GEONAMES_COLUMNS.asciiName] || name
  const countryCode = columns[GEONAMES_COLUMNS.countryCode]
  const regionCode = columns[GEONAMES_COLUMNS.admin1Code] || null
  const region = regionCode
    ? (admin1Lookup.get(`${countryCode}.${regionCode}`) ??
      titleCaseSegment(regionCode))
    : null
  const country = countryNames.of(countryCode) ?? countryCode
  const lat = Number(columns[GEONAMES_COLUMNS.latitude])
  const lng = Number(columns[GEONAMES_COLUMNS.longitude])
  const population = Number(columns[GEONAMES_COLUMNS.population] || '0')
  const timezone = columns[GEONAMES_COLUMNS.timezone] || null

  return {
    slug: slugifyCity(asciiName, countryCode),
    name,
    displayName: region
      ? `${name}, ${region}, ${country}`
      : `${name}, ${country}`,
    region,
    country,
    countryCode,
    lat,
    lng,
    address: region ? `${name}, ${region}, ${country}` : `${name}, ${country}`,
    aliases: toAliasList(
      name,
      asciiName,
      columns[GEONAMES_COLUMNS.alternateNames] ?? '',
    ),
    timezone,
    population,
  }
}

function dedupeCities(cities) {
  const bySlug = new Map()

  for (const city of cities) {
    const existing = bySlug.get(city.slug)
    if (!existing || city.population > existing.population) {
      bySlug.set(city.slug, city)
    }
  }

  return [...bySlug.values()]
}

function toConvexImportCity(city, timestamp) {
  return {
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
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

function formatSeedFile(cities) {
  const rows = cities.map(
    (city) => `  {
    slug: '${city.slug}',
    name: ${JSON.stringify(city.name)},
    displayName: ${JSON.stringify(city.displayName)},
    region: ${city.region ? JSON.stringify(city.region) : 'null'},
    country: ${JSON.stringify(city.country)},
    countryCode: '${city.countryCode}',
    lat: ${city.lat},
    lng: ${city.lng},
    address: ${city.address ? JSON.stringify(city.address) : 'null'},
    aliases: ${JSON.stringify(city.aliases)},
    timezone: ${city.timezone ? JSON.stringify(city.timezone) : 'null'},
  }`,
  )

  return `import type { SeedCity } from '../convex/citiesSeed'

export const GENERATED_CITIES: SeedCity[] = [
${rows.join(',\n')}
]
`
}

function formatOutput(cities, outputPath) {
  const timestamp = Date.now()

  if (outputPath.endsWith('.jsonl')) {
    return cities
      .map((city) => JSON.stringify(toConvexImportCity(city, timestamp)))
      .join('\n')
  }

  if (outputPath.endsWith('.json')) {
    return JSON.stringify(
      cities.map((city) => toConvexImportCity(city, timestamp)),
      null,
      2,
    )
  }

  return formatSeedFile(cities)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const raw = await readFile(args.input, 'utf8')
  const admin1Lookup = args.admin1
    ? buildAdmin1Lookup(await readFile(args.admin1, 'utf8'))
    : new Map()
  const lines = raw.split('\n').filter(Boolean)

  let cities = lines
    .map((line) => toSeedCity(line, admin1Lookup))
    .filter(Boolean)
  if (args.countries?.length) {
    const allow = new Set(args.countries)
    cities = cities.filter((city) => allow.has(city.countryCode))
  }

  const ranked = dedupeCities(cities)
    .sort((left, right) => right.population - left.population)
    .slice(0, args.limit)

  const outputPath =
    args.output || path.join(process.cwd(), 'scripts', 'generated-cities.ts')

  await writeFile(outputPath, formatOutput(ranked, outputPath), 'utf8')

  process.stdout.write(`Wrote ${ranked.length} cities to ${outputPath}\n`)
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
