import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'

it('uses an explicit snapshot timestamp rather than wall-clock time for reproducible JSONL', () => {
  const directory = mkdtempSync(join(tmpdir(), 'locatic-geonames-'))
  try {
    const columns = [
      '123',
      'Example City',
      'Example City',
      '',
      '12',
      '77',
      'P',
      'PPL',
      'IN',
      '',
      '19',
      '',
      '',
      '',
      '20000',
      '',
      '',
      'Asia/Kolkata',
      '2026-10-01',
    ]
    writeFileSync(join(directory, 'cities.txt'), columns.join('\t'))
    const output = join(directory, 'cities.jsonl')
    const args = [
      'scripts/geonames-to-cities-seed.mjs',
      '--input',
      join(directory, 'cities.txt'),
      '--output',
      output,
      '--timestamp',
      '123456',
    ]
    execFileSync(process.execPath, args)
    const first = readFileSync(output, 'utf8')
    expect(JSON.parse(first).createdAt).toBe(123456)
    execFileSync(process.execPath, args)
    expect(readFileSync(output, 'utf8')).toBe(first)
    expect(() =>
      execFileSync(process.execPath, [...args.slice(0, -1), 'invalid'], {
        stdio: 'pipe',
      }),
    ).toThrow()
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

it('refuses a tampered archived input before extraction or output', () => {
  const directory = mkdtempSync(join(tmpdir(), 'locatic-geonames-corrupt-'))
  try {
    writeFileSync(join(directory, 'cities.zip'), 'tampered')
    writeFileSync(
      join(directory, 'manifest.json'),
      JSON.stringify({
        inputs: { archive: { file: 'cities.zip', sha256: '0'.repeat(64) } },
      }),
    )
    expect(() =>
      execFileSync(
        process.execPath,
        [
          'scripts/verify-city-catalog.mjs',
          '--manifest',
          join(directory, 'manifest.json'),
        ],
        { stdio: 'pipe' },
      ),
    ).toThrow(/SHA-256 mismatch/)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
