export type SeedReaction = {
  key: string
  label: string
  icon: string
  targetTypes: Array<'project' | 'update' | 'post' | 'comment'>
  isActive: boolean
  sortOrder: number
}

export const DEFAULT_REACTIONS: SeedReaction[] = [
  {
    key: 'like',
    label: 'Like',
    icon: 'heart',
    targetTypes: ['project', 'update', 'post', 'comment'],
    isActive: true,
    sortOrder: 10,
  },
  {
    key: 'heart',
    label: 'Heart',
    icon: 'heart-filled',
    targetTypes: ['update', 'post', 'comment'],
    isActive: true,
    sortOrder: 20,
  },
  {
    key: 'rocket',
    label: 'Launch',
    icon: 'rocket',
    targetTypes: ['project', 'update', 'post', 'comment'],
    isActive: true,
    sortOrder: 30,
  },
  {
    key: 'fire',
    label: 'Fire',
    icon: 'flame',
    targetTypes: ['project', 'update', 'post', 'comment'],
    isActive: true,
    sortOrder: 40,
  },
  {
    key: 'eyes',
    label: 'Watching',
    icon: 'eye',
    targetTypes: ['project', 'update', 'post', 'comment'],
    isActive: true,
    sortOrder: 50,
  },
  {
    key: 'celebrate',
    label: 'Celebrate',
    icon: 'party-popper',
    targetTypes: ['project', 'update', 'post', 'comment'],
    isActive: true,
    sortOrder: 60,
  },
]
