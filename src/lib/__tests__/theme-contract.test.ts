import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DEFAULT_THEME_ID, THEME_IDS } from '../theme'

const styles = readFileSync(
  new URL('../../styles.css', import.meta.url),
  'utf8',
)

function getThemeDeclarations(themeId: string) {
  const selector =
    themeId === DEFAULT_THEME_ID
      ? `:root,\n[data-theme='${themeId}']`
      : `[data-theme='${themeId}']`
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = styles.match(
    new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\n\\}`, 'm'),
  )

  return match?.[1] ?? ''
}

describe('theme CSS contract', () => {
  it('defines every selectable theme and the tokens that drive primary and secondary accents', () => {
    for (const themeId of THEME_IDS) {
      const declarations = getThemeDeclarations(themeId)

      expect(declarations, `Missing CSS theme block for ${themeId}`).not.toBe(
        '',
      )
      expect(declarations).toContain('--lx-accent-l:')
      expect(declarations).toContain('--lx-accent-c:')
      expect(declarations).toContain('--lx-accent-h:')
      expect(declarations).toContain('--lx-accent-2:')
    }

    expect(styles).toContain('--primary:')
    expect(styles).toContain('--lx-accent-2:')
  })
})
