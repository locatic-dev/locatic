import {
  assertProtectedQaEnvironment,
  assertTrustedQaBranches,
} from './lib/member-qa-policy.ts'

async function read(path) {
  const repository = process.env.GITHUB_REPOSITORY
  if (
    !repository ||
    !/^[\w.-]+\/[\w.-]+$/.test(repository) ||
    !process.env.GH_TOKEN
  )
    throw new Error(
      'Repository metadata and a read-only GitHub token are required',
    )
  const response = await fetch(
    `https://api.github.com/repos/${repository}/${path}`,
    {
      headers: {
        Authorization: `Bearer ${process.env.GH_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    },
  )
  if (!response.ok)
    throw new Error(
      `Cannot verify QA protection (GitHub HTTP ${response.status}); refusing provider credentials`,
    )
  return await response.json()
}

try {
  const [environment, branches] = await Promise.all([
    read('environments/development-qa'),
    read('environments/development-qa/deployment-branch-policies?per_page=100'),
  ])
  assertProtectedQaEnvironment(environment)
  assertTrustedQaBranches(branches)
  if (branches.total_count !== branches.branch_policies.length)
    throw new Error('Unexpected additional QA branch policies')
  console.log(
    'Required reviewers, self-review prevention, no administrator bypass and explicit trusted branches verified.',
  )
} catch (error) {
  console.error(
    error instanceof Error ? error.message : 'Cannot verify QA environment',
  )
  process.exitCode = 1
}
