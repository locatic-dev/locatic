/** Only exact reviewed package/version/license supplements can fill empty notices. */
export function completeBundleNotices(
  report: string,
  supplements: ReadonlyMap<string, string>,
) {
  const [preamble, ...sections] = report.split(/^## /m)
  if (!sections.length)
    throw new Error('Bundle license report contains no packages')
  return (
    preamble +
    sections
      .map((section) => {
        const end = section.indexOf('\n')
        const heading = section.slice(0, end)
        const match = /^(.+) - (\S+) \((.+)\)$/.exec(heading)
        if (!match) throw new Error('Unexpected bundle license heading')
        if (section.slice(end).trim().length >= 200) return `## ${section}`
        const supplement = supplements.get(
          `${match[1]}@${match[2]} (${match[3]})`,
        )
        if (!supplement || supplement.length < 200)
          throw new Error(`Missing reviewed license text for ${heading}`)
        return `## ${heading}\n\n${supplement.trim()}\n\n`
      })
      .join('')
  )
}
