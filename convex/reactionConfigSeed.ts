export type SeedReaction = {
  key: string
  label: string
  emoji: string
  color: string
  targetTypes: Array<'project' | 'post' | 'comment'>
  isActive: boolean
  sortOrder: number
}

export const DEFAULT_REACTIONS: SeedReaction[] = [
  {
    key: 'like',
    label: 'Like',
    emoji: '❤️',
    color: '#f2555f',
    targetTypes: ['project', 'post', 'comment'],
    isActive: true,
    sortOrder: 10,
  },
  {
    key: 'rocket',
    label: 'Launch',
    emoji: '🚀',
    color: '#a78bfa',
    targetTypes: ['project', 'post', 'comment'],
    isActive: true,
    sortOrder: 30,
  },
  {
    key: 'fire',
    label: 'Fire',
    emoji: '🔥',
    color: '#fbbf24',
    targetTypes: ['project', 'post', 'comment'],
    isActive: true,
    sortOrder: 40,
  },
  {
    key: 'eyes',
    label: 'Watching',
    emoji: '👀',
    color: '#60a5fa',
    targetTypes: ['project', 'post', 'comment'],
    isActive: true,
    sortOrder: 50,
  },
  {
    key: 'celebrate',
    label: 'Celebrate',
    emoji: '🎉',
    color: '#f472b6',
    targetTypes: ['project', 'post', 'comment'],
    isActive: true,
    sortOrder: 60,
  },
]
