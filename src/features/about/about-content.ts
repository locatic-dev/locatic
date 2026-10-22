// One source for what Locatic is. The landing page, /about, the in-app about
// dialog, structured data and public/llms.txt all use this wording, so search
// engines and AI answers see the same definition everywhere. Every claim must
// match what ships today.

export const LOCATIC_DEFINITION =
  'Locatic is a social network for developers to discover projects and builders in their city and around the world. Anyone can browse public projects, profiles and posts. Sign in with GitHub to share your public repositories, post updates, follow builders, comment and send messages.'

export const CONTACT_EMAIL = 'contact@locatic.dev'

export const FOUNDERS = [
  { name: 'Saketha Rama', github: 'bv-saketha-rama' },
  { name: 'Avinash Changrani', github: 'nabobery' },
] as const

export function githubProfileUrl(login: string): string {
  return `https://github.com/${login}`
}
