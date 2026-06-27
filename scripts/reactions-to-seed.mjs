#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const VALID_TARGET_TYPES = new Set(['project', 'post', 'comment'])
const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

function parseArgs(argv) {
  const args = {
    input: path.join(process.cwd(), 'scripts', 'generated-reactions.json'),
    output: path.join(process.cwd(), 'convex', 'reactionConfigSeed.ts'),
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--input') args.input = argv[index + 1] ?? args.input
    if (arg === '--output') args.output = argv[index + 1] ?? args.output
  }

  return args
}

function assertReaction(value) {
  if (!value || typeof value !== 'object') {
    throw new Error('Reaction rows must be objects')
  }

  if (typeof value.key !== 'string' || value.key.trim().length === 0) {
    throw new Error('Reaction key is required')
  }

  if (typeof value.label !== 'string' || value.label.trim().length === 0) {
    throw new Error(`Reaction ${value.key} is missing label`)
  }

  if (typeof value.emoji !== 'string' || value.emoji.trim().length === 0) {
    throw new Error(`Reaction ${value.key} is missing emoji`)
  }

  if (typeof value.color !== 'string' || value.color.trim().length === 0) {
    throw new Error(`Reaction ${value.key} is missing color`)
  }
  if (!HEX_COLOR_RE.test(value.color.trim())) {
    throw new Error(
      `Reaction ${value.key} color must be a hex color like #f2555f`,
    )
  }

  if (!Array.isArray(value.targetTypes) || value.targetTypes.length === 0) {
    throw new Error(`Reaction ${value.key} needs targetTypes`)
  }

  for (const targetType of value.targetTypes) {
    if (!VALID_TARGET_TYPES.has(targetType)) {
      throw new Error(`Reaction ${value.key} has invalid target ${targetType}`)
    }
  }

  return {
    key: value.key.trim(),
    label: value.label.trim(),
    emoji: value.emoji.trim(),
    color: value.color.trim(),
    targetTypes: [...new Set(value.targetTypes)],
    isActive: value.isActive !== false,
    sortOrder: Number(value.sortOrder),
  }
}

function formatSeedFile(reactions) {
  const rows = reactions.map(
    (reaction) => `  {
    key: '${reaction.key}',
    label: ${JSON.stringify(reaction.label)},
    emoji: ${JSON.stringify(reaction.emoji)},
    color: '${reaction.color}',
    targetTypes: ${JSON.stringify(reaction.targetTypes)},
    isActive: ${reaction.isActive},
    sortOrder: ${reaction.sortOrder},
  }`,
  )

  return `export type SeedReaction = {
  key: string
  label: string
  emoji: string
  color: string
  targetTypes: Array<'project' | 'post' | 'comment'>
  isActive: boolean
  sortOrder: number
}

export const DEFAULT_REACTIONS: SeedReaction[] = [
${rows.join(',\n')}
]
`
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const raw = await readFile(args.input, 'utf8')
  const reactions = JSON.parse(raw).map(assertReaction)

  await writeFile(args.output, formatSeedFile(reactions), 'utf8')
  process.stdout.write(
    `Wrote ${reactions.length} reactions to ${args.output}\n`,
  )
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
