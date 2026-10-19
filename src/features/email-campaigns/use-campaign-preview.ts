import { useEffect, useRef, useState } from 'react'

import { getActionErrorMessage } from '@/lib/action-error'
import type { EmailPreviewArgs } from './contracts'
import { usePreviewEmailCampaign } from './mutations'

export const PREVIEW_DEBOUNCE_MS = 500

/**
 * Renders the unsaved editor content on the server about half a second after
 * typing stops. Every edit takes a new request number at once, before the
 * debounce, so a response for older content (still in flight, or landing
 * while the next edit waits) is ignored and leaves the loading state on. The
 * last good preview stays up while a newer one renders or fails.
 */
export function useCampaignPreview(value: EmailPreviewArgs) {
  const preview = usePreviewEmailCampaign()
  const latestRequest = useRef(0)
  // The effect keys on a serialized copy; the request sends the live value.
  const latestValue = useRef(value)
  latestValue.current = value
  const [html, setHtml] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const key = JSON.stringify(value)

  useEffect(() => {
    latestRequest.current += 1
    const requestId = latestRequest.current
    setIsLoading(true)
    const timer = setTimeout(() => {
      preview({ ...latestValue.current, requestId })
        .then((result) => {
          if (result.requestId !== latestRequest.current) return
          setHtml(result.html)
          setError(null)
          setIsLoading(false)
        })
        .catch((previewError: unknown) => {
          if (requestId !== latestRequest.current) return
          setError(getActionErrorMessage(previewError))
          setIsLoading(false)
        })
    }, PREVIEW_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [key, preview])

  return { html, error, isLoading }
}
