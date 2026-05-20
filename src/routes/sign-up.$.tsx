import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/sign-up/$')({
  beforeLoad: async () => {
    throw redirect({ to: '/sign-in/$' })
  },
})
