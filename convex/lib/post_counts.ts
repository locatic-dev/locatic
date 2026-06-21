export type UserPostCountBackfillCursor = number | null

export function shouldPatchUserPostsCount(
  currentPostsCount: number | null | undefined,
  actualPostsCount: number,
) {
  return (currentPostsCount ?? 0) !== actualPostsCount
}

export function getNextUserPostsCountBackfillCursor(
  users: Array<{ createdAt: number }>,
  limit: number,
): UserPostCountBackfillCursor {
  if (users.length !== limit) {
    return null
  }

  return users.at(-1)?.createdAt ?? null
}
