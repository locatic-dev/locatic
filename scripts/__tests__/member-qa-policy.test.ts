import { expect, it } from 'vitest'
import {
  assertProtectedQaEnvironment,
  assertTrustedQaBranches,
} from '../lib/member-qa-policy'

const protectedEnvironment = {
  protection_rules: [
    {
      type: 'required_reviewers',
      reviewers: [{ id: 1 }],
      prevent_self_review: true,
    },
  ],
  can_admins_bypass: false,
  deployment_branch_policy: { custom_branch_policies: true },
}
it('accepts a reviewed environment restricted to explicit trusted branches', () => {
  expect(() => assertProtectedQaEnvironment(protectedEnvironment)).not.toThrow()
  expect(() =>
    assertTrustedQaBranches({
      branch_policies: [
        { name: 'main', type: 'branch' },
        { name: 'dev', type: 'branch' },
      ],
    }),
  ).not.toThrow()
})
it.each([
  null,
  {},
  { ...protectedEnvironment, can_admins_bypass: true },
  { ...protectedEnvironment, deployment_branch_policy: null },
  { ...protectedEnvironment, protection_rules: [] },
  {
    ...protectedEnvironment,
    protection_rules: [
      {
        type: 'required_reviewers',
        reviewers: [{ id: 1 }],
        prevent_self_review: false,
      },
    ],
  },
])(
  'fails closed for absent or insufficient environment protection',
  (environment) =>
    expect(() => assertProtectedQaEnvironment(environment)).toThrow(),
)
it.each(['*', 'feature/unsafe', 'main*'])(
  'rejects an untrusted branch pattern %s',
  (name) =>
    expect(() =>
      assertTrustedQaBranches({ branch_policies: [{ name, type: 'branch' }] }),
    ).toThrow(),
)
