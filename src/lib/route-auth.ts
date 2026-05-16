import { redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { auth } from '@clerk/tanstack-react-start/server'

export const fetchRouteAuth = createServerFn({ method: 'GET' }).handler(
  async () => {
    const { isAuthenticated, userId } = await auth()

    return {
      isAuthenticated,
      userId,
    }
  },
)

export async function requireSignedInRoute() {
  const { isAuthenticated } = await fetchRouteAuth()

  if (!isAuthenticated) {
    throw redirect({ to: '/sign-in' })
  }
}
