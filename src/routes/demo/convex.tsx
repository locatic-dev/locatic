import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Sparkles, Globe2, Activity } from 'lucide-react'
import type { ReactNode } from 'react'
import type { QueryClient } from '@tanstack/react-query'

import {
  pulseQueryOptions,
  viewerQueryOptions,
} from '../../integrations/convex/query-options'

export const Route = createFileRoute('/demo/convex' as never)({
  loader: ({ context }: { context: { queryClient: QueryClient } }) =>
    context.queryClient.ensureQueryData(
      pulseQueryOptions({
        scopeType: 'global',
        scopeId: null,
        timeWindow: 'week',
        sort: 'locatic_likes',
        page: 1,
      }),
    ),
  component: ConvexTodos,
})

function ConvexTodos() {
  const { data: viewerState } = useQuery(viewerQueryOptions()) as {
    data:
      | {
          isAuthenticated: boolean
          needsOnboarding: boolean
          viewer: { _id: string } | null
        }
      | undefined
  }
  const { data: pulseState } = useQuery(
    pulseQueryOptions({
      scopeType: 'global',
      scopeId: null,
      timeWindow: 'week',
      sort: 'locatic_likes',
      page: 1,
    }),
  ) as {
    data:
      | {
          items: Array<{
            projectId: string
            rank: number
            score: number
            projectSnapshot: {
              fullName: string
              cityName: string | null
            }
          }>
        }
      | undefined
  }

  const pulseItems = pulseState?.items ?? []

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        background:
          'linear-gradient(135deg, #667a56 0%, #8fbc8f 25%, #90ee90 50%, #98fb98 75%, #f0fff0 100%)',
      }}
    >
      <div className="w-full max-w-2xl">
        {/* Header Card */}
        <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl border border-green-200/50 p-8 mb-6">
          <div className="text-center">
            <h1 className="text-4xl font-bold text-green-800 mb-2">
              Locatic Convex Backend
            </h1>
            <p className="text-green-600 text-lg">
              Powered by Convex, Clerk, and TanStack Query
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3 mb-6">
          <StatusCard
            icon={<Sparkles size={18} />}
            label="Auth State"
            value={
              viewerState?.isAuthenticated
                ? viewerState.needsOnboarding
                  ? 'Needs onboarding'
                  : 'Signed in'
                : 'Signed out'
            }
          />
          <StatusCard
            icon={<Globe2 size={18} />}
            label="Pulse Rows"
            value={String(pulseItems.length)}
          />
          <StatusCard
            icon={<Activity size={18} />}
            label="Viewer Record"
            value={viewerState?.viewer ? 'Available' : 'Missing'}
          />
        </div>

        <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-xl border border-green-200/50 overflow-hidden">
          {pulseState === undefined ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500 mx-auto mb-4"></div>
              <p className="text-green-600">Loading pulse snapshot...</p>
            </div>
          ) : pulseItems.length === 0 ? (
            <div className="p-12 text-center">
              <Globe2 size={48} className="text-green-300 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-green-800 mb-2">
                No pulse rows yet
              </h3>
              <p className="text-green-600">
                Seed cities and let the hourly pulse snapshot cron run.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-green-100">
              {pulseItems.map((item, index) => (
                <div
                  key={`${item.projectId}-${item.rank}`}
                  className="p-4 flex items-center gap-4 hover:bg-green-50/50 transition-colors"
                  style={{
                    animationDelay: `${index * 50}ms`,
                  }}
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-green-100 text-green-800 font-semibold">
                    #{item.rank}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-lg text-gray-800 font-medium">
                      {item.projectSnapshot.fullName}
                    </p>
                    <p className="text-sm text-gray-600">
                      Score {item.score} •{' '}
                      {item.projectSnapshot.cityName ?? 'Global'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center mt-6">
          <p className="text-green-700/80 text-sm">
            Built with Convex React Query integration and SSR-friendly query
            options
          </p>
        </div>
      </div>
    </div>
  )
}

function StatusCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode
  label: string
  value: string
}) {
  return (
    <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-xl border border-green-200/50 p-5">
      <div className="flex items-center gap-3 text-green-700 mb-2">
        {icon}
        <span className="font-medium">{label}</span>
      </div>
      <p className="text-2xl font-semibold text-green-900">{value}</p>
    </div>
  )
}
