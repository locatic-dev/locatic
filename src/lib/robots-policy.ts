/** Signed-in, auth and admin paths: nothing a search result should show. */
export const PRIVATE_PATHS = [
  '/home',
  '/inbox',
  '/notifications',
  '/saved',
  '/settings',
  '/profile',
  '/onboarding',
  '/admin',
  '/sign-in',
  '/sign-up',
] as const

/** Checks the origin policy and optional Cloudflare-managed additions. */
export function robotsPolicyProblems(
  body: string,
  sitemapUrl: string | null,
): string[] {
  if (sitemapUrl === null) {
    return body === 'User-agent: *\nDisallow: /\n'
      ? []
      : ['staging must disallow everything']
  }
  const problems: string[] = []
  const markers = [
    ...body.matchAll(/^\s*#\s*(BEGIN|END) Cloudflare Managed Content\s*$/gim),
  ]
  let origin = body
  if (markers.length > 0) {
    if (
      markers.length !== 2 ||
      markers[0][1].toLowerCase() !== 'begin' ||
      markers[1][1].toLowerCase() !== 'end'
    ) {
      return ['malformed Cloudflare managed block']
    }
    origin =
      body.slice(0, markers[0].index) +
      body.slice(markers[1].index! + markers[1][0].length)
  }
  const lines = (text: string) =>
    text
      .split(/\r?\n/)
      .map((line) => line.replace(/#.*$/, '').trim())
      .filter(Boolean)
  const originLines = lines(origin)
  const agents = originLines.filter((line) => /^user-agent\s*:/i.test(line))
  if (agents.length !== 1 || !/^user-agent\s*:\s*\*$/i.test(agents[0])) {
    problems.push('expected one origin wildcard User-agent group')
  }
  const disallows = new Set(
    originLines.flatMap(
      (line) => /^disallow\s*:\s*(.*)$/i.exec(line)?.[1] ?? [],
    ),
  )
  for (const path of PRIVATE_PATHS) {
    if (!disallows.has(path))
      problems.push(`missing private-path restriction: ${path}`)
  }
  if (
    !originLines.some(
      (line) =>
        /^sitemap\s*:/i.test(line) &&
        line.slice(line.indexOf(':') + 1).trim() === sitemapUrl,
    )
  ) {
    problems.push('no canonical sitemap line')
  }
  const expected = {
    search: 'yes',
    'ai-input': 'yes',
    'ai-train': 'no',
  } as const
  const originSignals = new Set<string>()
  let wildcard = false
  for (const line of lines(body)) {
    const agent = /^user-agent\s*:\s*(.*)$/i.exec(line)
    if (agent) wildcard = agent[1] === '*'
    if (wildcard && /^disallow\s*:\s*\/$/i.test(line)) {
      problems.push('wildcard policy blocks everything')
    }
    const allow = /^allow\s*:\s*(.*)$/i.exec(line)
    if (
      wildcard &&
      allow &&
      PRIVATE_PATHS.some((path) => allow[1].startsWith(path))
    ) {
      problems.push(`wildcard Allow overrides a private path: ${allow[1]}`)
    }
    const signal = /^content-signal\s*:\s*(.*)$/i.exec(line)
    if (!signal) continue
    for (const field of signal[1].split(',')) {
      const [key, value] = field
        .trim()
        .toLowerCase()
        .split(/\s*=\s*/)
      if (key in expected && value !== expected[key as keyof typeof expected]) {
        problems.push(`conflicting Content-Signal: ${field.trim()}`)
      }
    }
  }
  for (const line of originLines) {
    const signal = /^content-signal\s*:\s*(.*)$/i.exec(line)
    if (signal) {
      for (const field of signal[1].split(','))
        originSignals.add(field.toLowerCase().replace(/\s/g, ''))
    }
  }
  for (const [key, value] of Object.entries(expected)) {
    if (!originSignals.has(`${key}=${value}`))
      problems.push(`missing origin Content-Signal: ${key}=${value}`)
  }
  return problems
}
