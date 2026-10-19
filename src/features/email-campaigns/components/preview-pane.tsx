export interface PreviewPaneProps {
  html: string | null
  error: string | null
  isLoading: boolean
}

/**
 * The rendered email in a sandboxed frame (no scripts, no same-origin access),
 * as the server renders it for the inbox.
 */
export function PreviewPane({ html, error, isLoading }: PreviewPaneProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-eyebrow text-text-muted">preview</h3>
        <p role="status" className="font-mono text-meta text-text-muted">
          {isLoading ? 'Updating…' : ''}
        </p>
      </div>
      {error ? (
        <p role="alert" className="text-body text-danger">
          {error}
        </p>
      ) : null}
      {html ? (
        <iframe
          title="Email preview"
          sandbox=""
          srcDoc={html}
          className="h-160 w-full rounded-card border border-line bg-canvas"
        />
      ) : (
        <div className="flex h-40 items-center justify-center rounded-card border border-line">
          <p className="font-mono text-label text-text-muted">
            {isLoading ? 'Rendering…' : 'The preview appears here.'}
          </p>
        </div>
      )}
    </div>
  )
}
