import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const srcDir = fileURLToPath(new URL('../../', import.meta.url))
const styles = readFileSync(join(srcDir, 'styles.css'), 'utf8')
  .replace(/\r\n/g, '\n')
  .replace(/\/\*[\s\S]*?\*\//g, '')

/** Rule preludes with the at-rule blocks that enclose them. */
function rulePreludes(css: string) {
  const rules: Array<{ selector: string; enclosing: Array<string> }> = []
  const stack: Array<string> = []
  let buffer = ''
  for (const char of css) {
    if (char === '{') {
      const prelude = buffer.trim()
      rules.push({ selector: prelude, enclosing: [...stack] })
      stack.push(prelude)
      buffer = ''
    } else if (char === '}') {
      stack.pop()
      buffer = ''
    } else if (char === ';') {
      buffer = ''
    } else {
      buffer += char
    }
  }
  return rules
}

function sourceFiles(dir: string): Array<string> {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      return name === '__tests__' ? [] : sourceFiles(path)
    }
    return /\.tsx?$/.test(name) && !name.endsWith('.gen.ts') ? [path] : []
  })
}

// Elements that suppress the outline without drawing their own indicator,
// each for a stated reason. Anything else must pair outline-none with a ring
// or outline of its own.
const OUTLINE_SUPPRESSION_ALLOWLIST: Record<string, string> = {
  // The card around the cover link draws the outline (has-[…:focus-visible]).
  'components/ui/project-card.tsx': 'card draws the cover link focus outline',
  // Overlay container, not a control; its items carry the focus indicator.
  'components/ui/popover.tsx': 'container, not a control',
  // Non-interactive heading focused programmatically on step change.
  'features/onboarding/components/onboarding-shell.tsx':
    'tabindex=-1 heading, not a control',
}

describe('focus contract', () => {
  it('keeps the global focus outline and button cursor in the base layer so utilities can override them', () => {
    const rules = rulePreludes(styles)
    const focusRule = rules.find((rule) => rule.selector === ':focus-visible')
    const buttonRule = rules.find((rule) => rule.selector === 'button')

    expect(focusRule?.enclosing).toEqual(['@layer base'])
    expect(buttonRule?.enclosing).toEqual(['@layer base'])
  })

  it('never leaves a control with outline-none and no replacement focus indicator', () => {
    const offenders: Array<string> = []
    for (const file of sourceFiles(srcDir)) {
      // Allowlist keys use POSIX separators on every platform.
      const path = relative(srcDir, file).split(sep).join('/')
      if (path in OUTLINE_SUPPRESSION_ALLOWLIST) continue
      const literals = readFileSync(file, 'utf8').match(/(['"`])[^'"`]*\1/g)
      for (const literal of literals ?? []) {
        if (!/(^|[\s'"`:])outline-none\b/.test(literal)) continue
        if (/ring-\d|outline-\d|-outline-offset-/.test(literal)) continue
        offenders.push(`${path}: ${literal.slice(0, 80)}`)
      }
    }

    expect(offenders).toEqual([])
  })
})
