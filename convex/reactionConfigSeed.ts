export type SeedReaction = {
  key: string
  label: string
  icon: string
  targetTypes: Array<'project' | 'post' | 'comment'>
  isActive: boolean
  sortOrder: number
}

export const DEFAULT_REACTIONS: SeedReaction[] = [
  {
    key: 'like',
    label: 'Like',
    icon: 'heart-filled',
    targetTypes: ['project', 'post', 'comment'],
    isActive: true,
    sortOrder: 10,
  },
  {
    key: 'rocket',
    label: 'Launch',
    icon: 'rocket',
    targetTypes: ['project', 'post', 'comment'],
    isActive: true,
    sortOrder: 30,
  },
  {
    key: 'fire',
    label: 'Fire',
    icon: 'flame',
    targetTypes: ['project', 'post', 'comment'],
    isActive: true,
    sortOrder: 40,
  },
  {
    key: 'eyes',
    label: 'Watching',
    icon: 'eye',
    targetTypes: ['project', 'post', 'comment'],
    isActive: true,
    sortOrder: 50,
  },
  {
    key: 'celebrate',
    label: 'Celebrate',
    icon: 'party-popper',
    targetTypes: ['project', 'post', 'comment'],
    isActive: true,
    sortOrder: 60,
  },
]
