type ConvexAuthReadyState = {
  isAuthenticated: boolean
}

export function shouldEnableViewerSummaryQuery(auth: ConvexAuthReadyState) {
  return auth.isAuthenticated
}
