export interface SeedCity {
  slug: string
  name: string
  displayName: string
  region: string | null
  country: string
  countryCode: string
  lat: number
  lng: number
  address: string | null
  aliases: string[]
  timezone: string | null
}

export const DEFAULT_CITIES: SeedCity[] = [
  {
    slug: 'hyderabad-in',
    name: 'Hyderabad',
    displayName: 'Hyderabad, Telangana, India',
    region: 'Telangana',
    country: 'India',
    countryCode: 'IN',
    lat: 17.385,
    lng: 78.4867,
    address: 'Hyderabad, Telangana, India',
    aliases: ['hyd', 'cyberabad'],
    timezone: 'Asia/Kolkata',
  },
  {
    slug: 'bengaluru-in',
    name: 'Bengaluru',
    displayName: 'Bengaluru, Karnataka, India',
    region: 'Karnataka',
    country: 'India',
    countryCode: 'IN',
    lat: 12.9716,
    lng: 77.5946,
    address: 'Bengaluru, Karnataka, India',
    aliases: ['bangalore'],
    timezone: 'Asia/Kolkata',
  },
  {
    slug: 'berlin-de',
    name: 'Berlin',
    displayName: 'Berlin, Germany',
    region: 'Berlin',
    country: 'Germany',
    countryCode: 'DE',
    lat: 52.52,
    lng: 13.405,
    address: 'Berlin, Germany',
    aliases: [],
    timezone: 'Europe/Berlin',
  },
  {
    slug: 'san-francisco-us',
    name: 'San Francisco',
    displayName: 'San Francisco, California, United States',
    region: 'California',
    country: 'United States',
    countryCode: 'US',
    lat: 37.7749,
    lng: -122.4194,
    address: 'San Francisco, California, United States',
    aliases: ['sf'],
    timezone: 'America/Los_Angeles',
  },
  {
    slug: 'new-york-us',
    name: 'New York',
    displayName: 'New York, New York, United States',
    region: 'New York',
    country: 'United States',
    countryCode: 'US',
    lat: 40.7128,
    lng: -74.006,
    address: 'New York, New York, United States',
    aliases: ['nyc'],
    timezone: 'America/New_York',
  },
  {
    slug: 'london-gb',
    name: 'London',
    displayName: 'London, England, United Kingdom',
    region: 'England',
    country: 'United Kingdom',
    countryCode: 'GB',
    lat: 51.5072,
    lng: -0.1276,
    address: 'London, England, United Kingdom',
    aliases: [],
    timezone: 'Europe/London',
  },
  {
    slug: 'singapore-sg',
    name: 'Singapore',
    displayName: 'Singapore',
    region: null,
    country: 'Singapore',
    countryCode: 'SG',
    lat: 1.3521,
    lng: 103.8198,
    address: 'Singapore',
    aliases: [],
    timezone: 'Asia/Singapore',
  },
  {
    slug: 'tokyo-jp',
    name: 'Tokyo',
    displayName: 'Tokyo, Japan',
    region: 'Tokyo',
    country: 'Japan',
    countryCode: 'JP',
    lat: 35.6762,
    lng: 139.6503,
    address: 'Tokyo, Japan',
    aliases: [],
    timezone: 'Asia/Tokyo',
  },
]
