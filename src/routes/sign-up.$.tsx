import { createFileRoute, redirect } from '@tanstack/react-router'
import { validateSignInSearch } from '@/lib/safe-redirect'

export const Route = createFileRoute('/sign-up/$')({
  validateSearch: validateSignInSearch,
  beforeLoad: async ({ search }) => {
    throw redirect({ to: '/sign-in/$', search: { redirect: search.redirect } })
  },
})
