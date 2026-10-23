export function assertProtectedQaEnvironment(value: unknown) {
  if (!value || typeof value !== 'object')
    throw new Error('development-qa environment is missing')
  const environment = value as Record<string, unknown>
  const rules = Array.isArray(environment.protection_rules)
    ? environment.protection_rules
    : []
  const reviewers = rules.find((rule) => rule?.type === 'required_reviewers')
  if (
    !reviewers ||
    !Array.isArray(reviewers.reviewers) ||
    reviewers.reviewers.length === 0 ||
    reviewers.prevent_self_review !== true
  )
    throw new Error(
      'development-qa needs required reviewers with self-review prevented',
    )
  if (environment.can_admins_bypass !== false)
    throw new Error('Disable administrator bypass on development-qa')
  const policy = environment.deployment_branch_policy as Record<
    string,
    unknown
  > | null
  if (!policy || policy.custom_branch_policies !== true)
    throw new Error('Restrict development-qa to explicit trusted branches')
}

export function assertTrustedQaBranches(value: unknown) {
  if (!value || typeof value !== 'object')
    throw new Error('QA branch policy is missing')
  const policies = (
    value as { branch_policies?: Array<{ name?: string; type?: string }> }
  ).branch_policies
  if (
    !policies?.length ||
    policies.some(
      (policy) =>
        !['main', 'dev'].includes(policy.name ?? '') ||
        policy.type !== 'branch',
    )
  )
    throw new Error(
      'QA environment must allow only main/dev branches, with no wildcard or tag policy',
    )
}
