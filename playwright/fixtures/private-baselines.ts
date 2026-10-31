import { existsSync, realpathSync } from 'node:fs'
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path'

// A new baseline directory may sit below an existing symlink. Resolve that
// ancestor before checking whether the destination is outside the checkout.
function canonicalDestination(path: string): string {
  return existsSync(path)
    ? realpathSync(path)
    : join(canonicalDestination(dirname(path)), basename(path))
}

/** Provider-backed images may contain member data and never belong in source. */
export function privateBaselineTemplate(
  directory: string | undefined,
  repositoryRoot: string,
): string | undefined {
  if (!directory) return undefined
  if (!isAbsolute(directory))
    throw new Error(
      'E2E_PRIVATE_BASELINE_DIR must be an absolute directory outside the repository',
    )
  const destination = canonicalDestination(resolve(directory))
  const distance = relative(
    canonicalDestination(resolve(repositoryRoot)),
    destination,
  )
  if (
    distance === '' ||
    (!distance.startsWith(`..${sep}`) &&
      distance !== '..' &&
      !isAbsolute(distance))
  )
    throw new Error('E2E_PRIVATE_BASELINE_DIR must be outside the repository')
  return join(
    destination,
    '{projectName}',
    '{testFileName}-snapshots',
    '{arg}-{platform}{ext}',
  )
}
