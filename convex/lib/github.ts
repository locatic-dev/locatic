export type GithubContributionCalendar = {
  totalContributions: number
  weeks: Array<{
    days: Array<{
      date: string
      count: number
    }>
  }>
}

type GithubContributionGraphResponse = {
  user: {
    contributionsCollection: {
      contributionCalendar: {
        totalContributions: number
        weeks: Array<{
          contributionDays: Array<{
            date: string
            contributionCount: number
          }>
        }>
      }
    }
  } | null
}

export function extractContributionCalendar(
  result: GithubContributionGraphResponse,
): GithubContributionCalendar | null {
  const calendar = result.user?.contributionsCollection.contributionCalendar
  if (!calendar) {
    return null
  }

  return {
    totalContributions: calendar.totalContributions,
    weeks: calendar.weeks.map((week) => ({
      days: week.contributionDays.map((day) => ({
        date: day.date,
        count: day.contributionCount,
      })),
    })),
  }
}
