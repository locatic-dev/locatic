export type RouteAuthState = {
  isAuthenticated: boolean
  token: string | null
  userId: string | null
}

export function createClientRouteAuthStateGetter(
  fetchAuthState: () => Promise<RouteAuthState>,
) {
  let inFlightAuthState: Promise<RouteAuthState> | null = null

  return () => {
    if (!inFlightAuthState) {
      inFlightAuthState = fetchAuthState().finally(() => {
        inFlightAuthState = null
      })
    }

    return inFlightAuthState
  }
}

export function isProjectDetailPath(pathname: string) {
  return pathname.startsWith('/project/')
}
