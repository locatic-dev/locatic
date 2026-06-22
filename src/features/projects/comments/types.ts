import type { Id } from '../../../../convex/_generated/dataModel'
import type { ThreadedProjectComment } from '@/features/contracts'

export type ProjectCommentView = Omit<
  ThreadedProjectComment,
  '_id' | 'replies'
> & {
  _id: Id<'comments'> | string
  pending?: boolean
  previewReplies?: ProjectCommentView[]
  replies: ProjectCommentView[]
}
