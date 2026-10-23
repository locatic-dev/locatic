import type { RefObject } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Send } from '@/lib/icons'
import { CONTENT_LIMITS } from '../../../convex/lib/content_limits'

export function MessageComposer({
  value,
  sending,
  error,
  textareaRef,
  onChange,
  onSend,
}: {
  value: string
  sending: boolean
  error: string | null
  textareaRef: RefObject<HTMLTextAreaElement | null>
  onChange: (value: string) => void
  onSend: () => Promise<void>
}) {
  return (
    <div className="shrink-0 border-t border-line px-[var(--lx-gutter)] pt-2 pb-[calc(var(--lx-mobile-tab-height)+0.75rem)] md:pt-4 md:pb-5">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-1.5 rounded-card border border-line bg-surface p-1.5 transition-colors focus-within:border-line-strong md:gap-3 md:border-0 md:bg-transparent md:p-0">
        <Textarea
          maxLength={CONTENT_LIMITS.message}
          ref={textareaRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="write a message…"
          aria-label="Message"
          rows={1}
          className="max-h-28 min-h-11 min-w-0 border-0 bg-transparent py-2.5 font-sans md:min-h-20 md:border md:bg-surface md:py-2"
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void onSend()
            }
          }}
        />
        <Button
          type="button"
          onClick={() => void onSend()}
          disabled={!value.trim() || sending}
          variant="primary"
          size="touch"
          className="w-11 px-0 md:w-auto md:px-4"
          aria-label={sending ? 'Sending message' : 'Send message'}
        >
          <Send size={16} aria-hidden="true" className="md:hidden" />
          <span className="hidden md:inline">
            {sending ? 'sending…' : 'send'}
          </span>
        </Button>
      </div>
      {error && (
        <p role="alert" className="mt-2 mb-0 font-mono text-label text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
