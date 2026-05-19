export function getHomeCardDmTargetUserId({
  actorUserId,
  ownerUserId,
  viewerUserId,
}: {
  actorUserId: string
  ownerUserId: string
  viewerUserId?: string | null
}) {
  if (!actorUserId || !ownerUserId) {
    return null
  }

  return viewerUserId === ownerUserId ? null : ownerUserId
}
