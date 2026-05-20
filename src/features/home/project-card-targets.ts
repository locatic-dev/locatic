import type { Id } from '../../../convex/_generated/dataModel'

export function getHomeCardDmTargetUserId<
  TUserId extends string | Id<'users'>,
>({
  actorUserId,
  ownerUserId,
  viewerUserId,
}: {
  actorUserId: TUserId
  ownerUserId: TUserId
  viewerUserId?: TUserId | null
}) {
  if (!actorUserId || !ownerUserId) {
    return null
  }

  return viewerUserId === ownerUserId ? null : ownerUserId
}
