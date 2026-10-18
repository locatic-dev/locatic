// One source for what Locatic is. The landing page, /about, the in-app about
// dialog, structured data and public/llms.txt all use this wording, so search
// engines and AI answers see the same definition everywhere. Every claim must
// match what ships today.

export const LOCATIC_DEFINITION =
  'Locatic is a social network for developers that shows what people are building in each city. Builders sign in with GitHub, pick their city and the public repositories they want to show; anyone can browse projects, builders and posts by city or across the world, and members can follow, comment and message each other.'

export const CONTACT_EMAIL = 'contact@locatic.dev'

export const FOUNDERS = [
  { name: 'Saketha Rama', github: 'bv-saketha-rama' },
  { name: 'Avinash Changrani', github: 'nabobery' },
] as const

export function githubProfileUrl(login: string): string {
  return `https://github.com/${login}`
}
