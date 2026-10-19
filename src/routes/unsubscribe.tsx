import { createFileRoute } from '@tanstack/react-router'

import { UnsubscribePage } from '@/features/email-preferences/unsubscribe-page'

export const Route = createFileRoute('/unsubscribe')({
  validateSearch: (search: Record<string, unknown>) => ({
    t: typeof search.t === 'string' ? search.t : '',
  }),
  head: () => ({
    meta: [
      { title: 'Unsubscribe · Locatic' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: UnsubscribeRoute,
})

function UnsubscribeRoute() {
  const { t } = Route.useSearch()
  // Keyed by token: a different link starts from a fresh page, and a late
  // answer for the previous token lands on an unmounted card.
  return <UnsubscribePage key={t} token={t} />
}
