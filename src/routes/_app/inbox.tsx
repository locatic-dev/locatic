import { createFileRoute, stripSearchParams } from '@tanstack/react-router'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import {
  conversationRecipientPreviewQueryOptions,
  conversationSummaryQueryOptions,
} from '@/features/inbox/queries'
import { InboxPanes } from '@/features/inbox/inbox-panes'
import { ConversationList } from '@/features/inbox/conversation-list'
import { useInboxConversations } from '@/features/inbox/use-inbox-conversations'
import { DraftConversationPanel } from '@/features/inbox/draft-conversation-panel'
import { SelectedConversationPanel } from '@/features/inbox/selected-conversation-panel'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { Inbox } from '@/lib/icons'
import { formatUnreadCount } from '@/lib/format'
import {
  mapConversationList,
  mapViewerBootstrap,
  type EnrichedConversation,
  type ViewerBootstrapPayload,
} from '@/features/contracts'
import { viewerQueryOptions } from '@/features/viewer/queries'
import {
  InboxRoutePending,
  ROUTE_PENDING_MIN_MS,
  ROUTE_PENDING_MS,
} from '@/components/app-shell/route-pending'
import {
  getInboxDestinationSearch,
  getInboxTabForStatus,
  INBOX_SEARCH_DEFAULTS,
  normalizeInboxSearch,
  type InboxSearch,
} from '@/features/inbox/navigation'
import { shouldPrefetchPrivateConvexQueries } from '@/lib/auth-routing'
import { seo } from '@/lib/seo'

export const Route = createFileRoute('/_app/inbox')({
  validateSearch: normalizeInboxSearch,
  search: {
    middlewares: [
      stripSearchParams<InboxSearch, InboxSearch>(INBOX_SEARCH_DEFAULTS),
    ],
  },
  loaderDeps: ({ search }) => ({
    composeUserId: search.compose,
    conversationId: search.conversation,
  }),
  loader: async ({ context, deps }) => {
    void deps.conversationId
    void deps.composeUserId

    // Client navigations fetch in the page, once Convex auth is ready.
    if (!shouldPrefetchPrivateConvexQueries()) {
      return
    }

    await context.queryClient.ensureQueryData(viewerQueryOptions())
  },
  pendingComponent: InboxRoutePending,
  pendingMs: ROUTE_PENDING_MS,
  pendingMinMs: ROUTE_PENDING_MIN_MS,
  head: () => seo({ title: 'inbox', noindex: true }),
  component: InboxPage,
})

function InboxPage() {
  const {
    tab,
    conversation: selectedId,
    compose: composeUserId,
  } = Route.useSearch()
  const navigate = Route.useNavigate()
  const { data: viewerData } = useSuspenseQuery(viewerQueryOptions())
  const conversationPages = useInboxConversations()
  const summaryQuery = useQuery(conversationSummaryQueryOptions(selectedId))

  const viewer = mapViewerBootstrap(
    viewerData as ViewerBootstrapPayload | undefined,
  )
  const viewerId = viewer?.viewer?.id ? String(viewer.viewer.id) : null
  // The one message-attention count: the server counter the sidebar and the
  // mobile tab bar badge also read (`users.viewerBootstrap`).
  const unreadMessages = viewer?.viewer?.unreadMessagesCount ?? 0
  const allConversations =
    mapConversationList(
      conversationPages.items as Array<EnrichedConversation>,
    ) ?? []
  const selectedConversation = !selectedId
    ? null
    : summaryQuery.data !== undefined
      ? summaryQuery.data
      : (allConversations.find(
          (conversation) => String(conversation._id) === selectedId,
        ) ?? null)
  // A stored link (a notification, a bookmark) can name a tab the
  // conversation has since left, e.g. a request accepted after it was sent.
  // The selected conversation's own status decides which list shows it.
  const activeTab = selectedConversation
    ? getInboxTabForStatus(selectedConversation.status)
    : tab
  const conversations = allConversations.filter(
    (conversation) => getInboxTabForStatus(conversation.status) === activeTab,
  )
  const incomingRequestCount = allConversations.filter(
    (conversation) => conversation.status === 'request',
  ).length
  const recipientPreviewQuery = useQuery(
    conversationRecipientPreviewQueryOptions(
      composeUserId && !selectedConversation ? composeUserId : null,
    ),
  )
  const draftRecipient = recipientPreviewQuery.data ?? null
  const composePreviewLoading =
    Boolean(composeUserId) &&
    !selectedConversation &&
    recipientPreviewQuery.isLoading
  const composePreviewInvalid =
    Boolean(composeUserId) &&
    !selectedConversation &&
    !recipientPreviewQuery.isLoading &&
    !draftRecipient
  const hasDetailPanel = Boolean(
    selectedId ||
    selectedConversation ||
    draftRecipient ||
    composePreviewLoading ||
    composePreviewInvalid,
  )
  // Narrow Inbox containers show one pane at a time, chosen by the URL.
  // InboxPanes shows both only when there is room alongside the app sidebar.
  const mobileView = hasDetailPanel ? 'thread' : 'list'
  // With nothing to list and nothing open, the list's empty state is the only
  // message; no second "select a conversation" placeholder beside it.
  const listOnly = conversations.length === 0 && !hasDetailPanel
  const tabItems = [
    { id: 'inbox', label: 'inbox', count: 0 },
    { id: 'requests', label: 'requests', count: incomingRequestCount },
  ] as const

  const openProfile = (username: string | null | undefined) => {
    if (!username) {
      return
    }

    void navigate({
      to: '/u/$username',
      params: { username },
      search: { tab: 'projects', network: 'followers' },
    })
  }

  return (
    <div className="lx-page-shell h-[calc(100dvh-var(--lx-mobile-tab-height))] min-h-0 overflow-hidden md:h-dvh">
      <div className="shrink-0 border-b border-line">
        <div className="flex min-h-14 items-center gap-3 px-[var(--lx-gutter)]">
          <h1 className="m-0 text-headline text-text">inbox</h1>
          {unreadMessages > 0 && (
            <span className="font-mono text-meta text-text-muted">
              {formatUnreadCount(unreadMessages)} unread
            </span>
          )}
        </div>
        {/* Pulled left by the tab padding: the first label lines up with the
            title. */}
        <div className="lx-inline-tabs -ml-3 gap-0 px-[var(--lx-gutter)]">
          {tabItems.map((tabItem) => (
            <button
              key={tabItem.id}
              onClick={() =>
                void navigate({
                  to: '/inbox',
                  search: {
                    compose: null,
                    conversation: null,
                    tab: tabItem.id,
                  },
                })
              }
              aria-current={activeTab === tabItem.id ? 'page' : undefined}
              className={`relative inline-flex items-center gap-[7px] rounded-md px-3 py-2.5 font-mono text-label transition-colors active:scale-[0.98] ${
                activeTab === tabItem.id
                  ? 'font-semibold text-text'
                  : 'text-text-muted hover:text-text'
              }`}
              type="button"
            >
              {tabItem.label}
              {tabItem.count > 0 && (
                <span className="rounded-pill bg-surface-alt px-[5px] py-px font-mono text-meta leading-[1.3] text-text-muted">
                  {tabItem.count}
                  {conversationPages.hasMore ? '+' : ''}
                </span>
              )}
              {activeTab === tabItem.id && (
                <div className="absolute inset-x-3 -bottom-px h-0.5 bg-brand" />
              )}
            </button>
          ))}
        </div>
      </div>

      <InboxPanes
        view={mobileView}
        listOnly={listOnly}
        list={
          <div className="min-h-0 flex-1 overflow-y-auto">
            {conversationPages.loading && (
              <div
                role="status"
                aria-label="loading conversations"
                className="p-6 text-label text-text-muted"
              >
                loading conversations…
              </div>
            )}
            {!conversationPages.loading &&
              conversations.length === 0 &&
              conversationPages.hasMore && (
                <p className="m-0 p-6 text-label text-text-muted">
                  older conversations may include{' '}
                  {activeTab === 'requests'
                    ? 'message requests'
                    : 'more messages'}
                  .
                </p>
              )}
            {!conversationPages.loading &&
              conversations.length === 0 &&
              !conversationPages.hasMore && (
                <EmptyState
                  size="compact"
                  icon={<Inbox size={28} strokeWidth={1.2} />}
                  title={
                    activeTab === 'requests'
                      ? 'no message requests'
                      : 'no conversations yet'
                  }
                  description={
                    activeTab === 'requests'
                      ? 'requests from builders you don’t follow back will land here.'
                      : 'start a conversation from a builder’s profile to see it here.'
                  }
                />
              )}

            <ConversationList
              conversations={conversations}
              activeTab={activeTab}
              viewerId={viewerId}
              selectedId={selectedId}
              onOpenProfile={openProfile}
              onSelectConversation={(conversationId) =>
                void navigate({
                  to: '/inbox',
                  search: {
                    compose: null,
                    tab: activeTab,
                    conversation: conversationId,
                  },
                })
              }
            />
            {conversationPages.hasMore && (
              <Button
                className="m-4"
                disabled={
                  conversationPages.loading || conversationPages.loadingMore
                }
                onClick={() => conversationPages.loadMore()}
              >
                {conversationPages.loadingMore
                  ? 'loading conversations…'
                  : 'load more conversations'}
              </Button>
            )}
          </div>
        }
      >
        {!hasDetailPanel && !listOnly && (
          <EmptyState
            icon={<Inbox size={32} strokeWidth={1.2} />}
            title="select a conversation"
            description="pick a thread from the list to read and reply."
          />
        )}

        {selectedId &&
          !selectedConversation &&
          (summaryQuery.isLoading ? (
            <div
              role="status"
              aria-label="loading conversation"
              className="p-6 text-label text-text-muted"
            >
              loading conversation…
            </div>
          ) : (
            <EmptyState
              title="couldn't open this conversation"
              description="this conversation is unavailable."
              action={{
                label: 'back to inbox',
                onClick: () =>
                  void navigate({
                    to: '/inbox',
                    search: {
                      compose: null,
                      conversation: null,
                      tab: activeTab,
                    },
                  }),
              }}
            />
          ))}

        {composePreviewLoading && (
          <div
            role="status"
            aria-label="loading recipient"
            className="flex flex-1 flex-col items-center justify-center gap-3.5 px-[var(--lx-gutter)]"
          >
            <Skeleton className="size-9 rounded-full" />
            <div className="flex flex-col items-center gap-2">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
        )}

        {composePreviewInvalid && (
          <EmptyState
            icon={<Inbox size={32} strokeWidth={1.2} />}
            title="couldn't open this draft"
            description="the message draft is no longer available."
            action={{
              label: 'back to inbox',
              onClick: () =>
                void navigate({
                  to: '/inbox',
                  search: {
                    compose: null,
                    tab: activeTab,
                    conversation: null,
                  },
                }),
            }}
          />
        )}

        {selectedConversation && viewerId && (
          <SelectedConversationPanel
            key={String(selectedConversation._id)}
            selectedConversation={selectedConversation}
            viewerId={viewerId}
            onBack={() =>
              void navigate({
                to: '/inbox',
                search: { compose: null, conversation: null, tab: activeTab },
              })
            }
            onOpenProfile={openProfile}
          />
        )}

        {!selectedConversation && composeUserId && draftRecipient && (
          <DraftConversationPanel
            key={String(draftRecipient.userId)}
            recipient={draftRecipient}
            onBack={() =>
              void navigate({
                to: '/inbox',
                search: { compose: null, conversation: null, tab: activeTab },
              })
            }
            onOpenProfile={openProfile}
            onConversationCreated={async (id) => {
              await navigate({
                to: '/inbox',
                search: getInboxDestinationSearch(String(id), 'inbox'),
              })
            }}
          />
        )}
      </InboxPanes>
    </div>
  )
}
