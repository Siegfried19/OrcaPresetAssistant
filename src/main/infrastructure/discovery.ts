import { lstat, mkdir } from 'node:fs/promises'
import { join, parse, resolve } from 'node:path'

import type { RootResolution } from '../domain/models'
import { ensureWorkspaceGuidance } from './workspace-guidance'

export const USER_PRESETS_DIRECTORY = 'UserPresets'
export const PRINT_HISTORY_DIRECTORY = 'PrintHistory'
export const PRESET_DIRECTORIES = ['machine', 'process', 'filament'] as const

export interface WorkspacePaths {
  readonly root: string
  readonly userPresets: string
  readonly printHistory: string
}

function safeWorkspacePath(path: string): string | null {
  if (typeof path !== 'string' || !path.trim()) return null
  const absolutePath = resolve(path)
  return absolutePath === parse(absolutePath).root ? null : absolutePath
}

async function isPlainDirectory(path: string): Promise<boolean> {
  try {
    const value = await lstat(path)
    return value.isDirectory() && !value.isSymbolicLink()
  } catch {
    return false
  }
}

async function looksLikeSlicerPresetRoot(path: string): Promise<boolean> {
  const directPresetDirectories = await Promise.all(
    PRESET_DIRECTORIES.map((directory) => isPlainDirectory(join(path, directory))),
  )
  return directPresetDirectories.filter(Boolean).length >= 2
}

export function workspacePaths(path: string): WorkspacePaths {
  const root = safeWorkspacePath(path)
  if (!root) {
    throw new Error('invalid-workspace-root')
  }

  return {
    root,
    userPresets: join(root, USER_PRESETS_DIRECTORY),
    printHistory: join(root, PRINT_HISTORY_DIRECTORY),
  }
}

export async function isWorkspaceRoot(path: string): Promise<boolean> {
  let paths: WorkspacePaths
  try {
    paths = workspacePaths(path)
  } catch {
    return false
  }

  if (!(await isPlainDirectory(paths.root))) return false
  if (!(await isPlainDirectory(paths.userPresets))) return false
  if (!(await isPlainDirectory(paths.printHistory))) return false

  return (
    await Promise.all(
      PRESET_DIRECTORIES.map((directory) => isPlainDirectory(join(paths.userPresets, directory))),
    )
  ).every(Boolean)
}

export async function ensureWorkspaceRoot(path: string): Promise<WorkspacePaths> {
  const paths = workspacePaths(path)
  if (!(await isPlainDirectory(paths.root))) {
    throw new Error('invalid-workspace-root')
  }
  if (await looksLikeSlicerPresetRoot(paths.root)) {
    throw new Error('slicer-preset-root-is-not-a-workspace')
  }

  await mkdir(paths.userPresets).catch(async (error: unknown) => {
    if (!(await isPlainDirectory(paths.userPresets))) throw error
  })
  await mkdir(paths.printHistory).catch(async (error: unknown) => {
    if (!(await isPlainDirectory(paths.printHistory))) throw error
  })

  for (const directory of PRESET_DIRECTORIES) {
    const target = join(paths.userPresets, directory)
    await mkdir(target).catch(async (error: unknown) => {
      if (!(await isPlainDirectory(target))) throw error
    })
  }

  await ensureWorkspaceGuidance(paths.userPresets)

  if (!(await isWorkspaceRoot(paths.root))) {
    throw new Error('invalid-workspace-root')
  }
  return paths
}

export async function discoverWorkspaceRoot(savedRoot?: string): Promise<RootResolution | null> {
  const environmentRoot = process.env.ORCA_PRESET_ASSISTANT_WORKSPACE
  if (environmentRoot && (await isWorkspaceRoot(environmentRoot))) {
    return { path: resolve(environmentRoot), source: 'manual' }
  }

  if (savedRoot && (await isWorkspaceRoot(savedRoot))) {
    return { path: resolve(savedRoot), source: 'saved' }
  }

  return null
}
