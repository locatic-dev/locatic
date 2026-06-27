export const LEGACY_REACTION_EMOJI_BY_SLUG: Record<string, string> = {
  'heart-filled': '❤️',
  heart: '❤️',
  rocket: '🚀',
  flame: '🔥',
  eye: '👀',
  'party-popper': '🎉',
}

export type ReactionConfigTargetType = 'project' | 'post' | 'comment'

export type ReactionConfigWrite = {
  key?: string
  label: string
  emoji: string
  color?: string
  targetTypes: ReactionConfigTargetType[]
  isActive: boolean
  sortOrder: number
  createdAt: number
  updatedAt: number
}

export type LegacyReactionConfigRecord = ReactionConfigWrite & {
  icon?: string
}

export function normalizeReactionEmoji(emoji: string) {
  return LEGACY_REACTION_EMOJI_BY_SLUG[emoji] ?? emoji
}

export function sanitizeReactionConfigForWrite(
  config: LegacyReactionConfigRecord,
): ReactionConfigWrite {
  return {
    ...(typeof config.key === 'string' ? { key: config.key } : {}),
    label: config.label,
    emoji: normalizeReactionEmoji(config.emoji),
    ...(typeof config.color === 'string' ? { color: config.color } : {}),
    targetTypes: config.targetTypes,
    isActive: config.isActive,
    sortOrder: config.sortOrder,
    createdAt: config.createdAt,
    updatedAt: config.updatedAt,
  }
}
