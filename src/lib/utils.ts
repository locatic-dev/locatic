import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// Teach tailwind-merge the custom scales registered in src/styles.css so that
// conflicting classes resolve to the last one (for example `rounded-md` then
// `rounded-card`) and custom text sizes are not mistaken for text colours.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      radius: ['control', 'card', 'pill'],
      shadow: ['card', 'floating'],
      text: ['display', 'headline', 'title', 'body', 'label', 'meta'],
      color: [
        'canvas',
        'surface',
        'surface-chrome',
        'surface-alt',
        'surface-raised',
        'surface-accent',
        'line',
        'line-strong',
        'control',
        'text',
        'text-muted',
        'text-faint',
        'brand',
        'brand-quiet',
        'brand-foreground',
        'brand-2',
        'brand-2-quiet',
        'selected',
        'selected-bar',
        'state-hover',
        'outgoing',
        'unread',
        'liked',
        'success',
        'warning',
        'danger',
        'place',
        'place-quiet',
        'focus',
      ],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
