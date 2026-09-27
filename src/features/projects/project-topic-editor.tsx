import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, X } from '@/lib/icons'

type ProjectTopicEditorProps = {
  isOwnProject: boolean
  onAddTopic: () => void | Promise<void>
  onRemoveTopic: (topic: string) => void | Promise<void>
  pending: boolean
  setTopicDraft: (value: string) => void
  topicDraft: string
  topics: string[]
}

export function ProjectTopicEditor({
  isOwnProject,
  onAddTopic,
  onRemoveTopic,
  pending,
  setTopicDraft,
  topicDraft,
  topics,
}: ProjectTopicEditorProps) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      {topics.map((topic) => (
        <span
          key={topic}
          className="inline-flex min-h-7 items-center gap-1 rounded-pill border border-brand/30 bg-brand-quiet px-2.5 py-1 font-mono text-meta text-brand"
        >
          #{topic}
          {isOwnProject && (
            <button
              type="button"
              onClick={() => void onRemoveTopic(topic)}
              disabled={pending}
              className="-my-2 -mr-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-md bg-transparent text-brand transition-colors hover:text-text"
              aria-label={`Remove ${topic}`}
            >
              <X size={12} />
            </button>
          )}
        </span>
      ))}
      {isOwnProject && (
        <form
          className="flex min-w-0 flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            void onAddTopic()
          }}
        >
          <Input
            value={topicDraft}
            onChange={(event) => setTopicDraft(event.target.value)}
            placeholder="add topic"
            aria-label="New topic"
            className="h-9 w-36"
          />
          <Button
            type="submit"
            disabled={!topicDraft.trim() || pending}
            aria-label="Add topic"
          >
            <Plus size={13} />
            topic
          </Button>
        </form>
      )}
    </div>
  )
}
