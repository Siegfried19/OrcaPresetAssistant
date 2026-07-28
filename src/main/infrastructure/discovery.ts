import { access, readdir, stat } from 'node:fs/promises'
import { constants } from 'node:fs'
import { join, resolve } from 'node:path'

import type { RootResolution } from '../domain/models'

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}

export async function isPresetRoot(path: string): Promise<boolean> {
  const absolutePath = resolve(path)
  const processDirectory = join(absolutePath, 'process')
  const filamentDirectory = join(absolutePath, 'filament')

  return (await isDirectory(processDirectory)) && (await isDirectory(filamentDirectory))
}

async function hasReadableJson(directory: string): Promise<boolean> {
  try {
    await access(directory, constants.R_OK)
    const entries = await readdir(directory, { withFileTypes: true })
    return entries.some((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json'))
  } catch {
    return false
  }
}

async function scoreCandidate(path: string): Promise<number> {
  let score = 0
  if (await hasReadableJson(join(path, 'process'))) score += 3
  if (await hasReadableJson(join(path, 'filament'))) score += 3
  if (await isDirectory(join(path, 'machine'))) score += 1
  if (await isDirectory(join(path, '.git'))) score += 2
  return score
}

export async function discoverPresetRoot(
  appDataPath: string,
  savedRoot?: string,
): Promise<RootResolution | null> {
  const environmentRoot = process.env.BAMBU_PRESET_ROOT
  if (environmentRoot && (await isPresetRoot(environmentRoot))) {
    return { path: resolve(environmentRoot), source: 'manual' }
  }

  if (savedRoot && (await isPresetRoot(savedRoot))) {
    return { path: resolve(savedRoot), source: 'saved' }
  }

  const usersDirectory = join(appDataPath, 'BambuStudio', 'user')
  let entries
  try {
    entries = await readdir(usersDirectory, { withFileTypes: true })
  } catch {
    return null
  }

  const candidates = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(usersDirectory, entry.name))

  const scored = await Promise.all(
    candidates.map(async (path) => ({
      path,
      score: await scoreCandidate(path),
    })),
  )

  const best = scored
    .filter((candidate) => candidate.score >= 6)
    .sort((left, right) => right.score - left.score)[0]

  return best ? { path: resolve(best.path), source: 'automatic' } : null
}
