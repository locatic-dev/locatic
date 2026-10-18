import { createFileRoute } from '@tanstack/react-router'
import { renderRobotsTxt } from '@/lib/robots'

/** /robots.txt: open in production, closed on every other host. */
export const Route = createFileRoute('/robots.txt')({
  server: {
    handlers: {
      GET: ({ request }) =>
        new Response(renderRobotsTxt(new URL(request.url)), {
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'public, max-age=3600',
          },
        }),
    },
  },
})
