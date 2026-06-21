export function removeReplyDraft(
  drafts: Record<string, string>,
  commentId: string,
) {
  const next = { ...drafts }
  delete next[commentId]
  return next
}
