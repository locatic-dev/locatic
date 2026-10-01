import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, X } from '@/lib/icons'
import { cn } from '@/lib/utils'

type ProjectTopicEditorProps = {
  className?: string
  isOwnProject: boolean
  onAddTopic: () => void | Promise<void>
  onRemoveTopic: (topic: string) => void | Promise<void>
  pending: boolean
  setTopicDraft: (value: string) => void
  topicDraft: string
  topics: string[]
}

export function ProjectTopicEditor({
  className,
  isOwnProject,
  onAddTopic,
  onRemoveTopic,
  pending,
  setTopicDraft,
  topicDraft,
  topics,
}: ProjectTopicEditorProps) {
  // Nothing to show or edit: render no element, so the header column's gap
  // does not open around an empty row.
  if (topics.length === 0 && !isOwnProject) {
    return null
  }

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {topics.map((topic) => (
        <span
          key={topic}
          className="inline-flex min-h-7 items-center gap-1 rounded-pill border border-line px-2.5 py-1 font-mono text-meta text-text-muted"
        >
          #{topic}
          {isOwnProject && (
            <button
              type="button"
              onClick={() => void onRemoveTopic(topic)}
              disabled={pending}
              className="inline-flex size-5 items-center justify-center rounded-full bg-transparent text-text-muted transition-colors hover:text-text pointer-coarse:-my-2 pointer-coarse:-mr-2 pointer-coarse:size-11"
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
            // Chip height to sit in the chip row; 44px on touch. Input keeps
            // its 16px text below md so iOS does not zoom on focus.
            className="h-7 w-36 px-2.5 py-0 text-meta pointer-coarse:h-11"
          />
          <Button
            type="submit"
            size="sm"
            className="pointer-coarse:min-h-11"
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
