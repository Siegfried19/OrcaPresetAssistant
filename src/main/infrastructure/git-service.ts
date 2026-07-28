import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { promisify } from 'node:util'

import type { DiffStats, GitState, PresetDiff } from '@shared/contracts'

import type { InternalPreset } from '../domain/models'

const execFileAsync = promisify(execFile)

interface GitCommandResult {
  readonly ok: boolean
  readonly stdout: string
}

export interface GitSnapshot {
  readonly isRepository: boolean
  readonly states: ReadonlyMap<string, string>
}

function normalizeGitPath(path: string): string {
  return path.replaceAll('\\', '/')
}

async function runGit(rootPath: string, args: readonly string[]): Promise<GitCommandResult> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['-c', `safe.directory=${rootPath}`, '-C', rootPath, ...args],
      {
        encoding: 'utf8',
        windowsHide: true,
        maxBuffer: 4 * 1024 * 1024,
      },
    )
    return { ok: true, stdout }
  } catch {
    return { ok: false, stdout: '' }
  }
}

export function parsePorcelainStatus(output: string): Map<string, string> {
  const states = new Map<string, string>()
  const records = output.split('\0')

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]
    if (!record || record.length < 4) continue

    const code = record.slice(0, 2)
    const path = normalizeGitPath(record.slice(3))
    states.set(path, code)

    if (code.includes('R') || code.includes('C')) {
      index += 1
    }
  }

  return states
}

export async function readGitSnapshot(rootPath: string): Promise<GitSnapshot> {
  const result = await runGit(rootPath, ['status', '--porcelain=v1', '-z', '--untracked-files=all'])

  return {
    isRepository: result.ok,
    states: result.ok ? parsePorcelainStatus(result.stdout) : new Map(),
  }
}

function classifyFileState(code: string | undefined): GitState {
  if (!code) return 'clean'
  if (code === '??') return 'new'
  return 'modified'
}

async function summarizeModifiedPreset(
  rootPath: string,
  relativePaths: readonly string[],
): Promise<DiffStats | null> {
  const result = await runGit(rootPath, ['diff', 'HEAD', '--numstat', '--', ...relativePaths])
  if (!result.ok || !result.stdout.trim()) return null

  let added = 0
  let deleted = 0
  for (const line of result.stdout.trim().split(/\r?\n/u)) {
    const [addedText, deletedText] = line.split(/\s+/u)
    added += Number.parseInt(addedText ?? '0', 10) || 0
    deleted += Number.parseInt(deletedText ?? '0', 10) || 0
  }
  return { added, deleted }
}

export async function applyGitState(
  rootPath: string,
  presets: InternalPreset[],
  snapshot: GitSnapshot,
): Promise<void> {
  await Promise.all(
    presets.map(async (preset) => {
      if (!snapshot.isRepository) {
        preset.gitState = 'unknown'
        preset.diffStats = null
        return
      }

      const jsonCode = snapshot.states.get(preset.relativePath)
      const infoCode = preset.relativeInfoPath
        ? snapshot.states.get(preset.relativeInfoPath)
        : undefined
      const jsonState = classifyFileState(jsonCode)
      const infoState = classifyFileState(infoCode)

      if (jsonState === 'new') {
        preset.gitState = 'new'
        preset.diffStats = null
      } else if (jsonState === 'modified') {
        preset.gitState = 'modified'
        preset.diffStats = await summarizeModifiedPreset(rootPath, [preset.relativePath])
      } else if (infoState === 'new' || infoState === 'modified') {
        preset.gitState = 'metadata'
        preset.diffStats = null
      } else {
        preset.gitState = 'clean'
        preset.diffStats = null
      }
    }),
  )
}

export async function readPresetDiff(preset: InternalPreset): Promise<PresetDiff> {
  if (preset.gitState === 'clean') {
    return {
      title: preset.name,
      content: '',
      state: 'clean',
    }
  }

  if (preset.gitState === 'unknown') {
    return {
      title: preset.name,
      content: '',
      state: 'unknown',
    }
  }

  if (preset.gitState === 'new') {
    const content = await readFile(preset.filePath, 'utf8')
    return {
      title: preset.name,
      content,
      state: 'new',
    }
  }

  const relativePaths = [
    preset.relativePath,
    ...(preset.relativeInfoPath ? [preset.relativeInfoPath] : []),
  ]
  const result = await runGit(preset.rootPath, [
    'diff',
    'HEAD',
    '--no-ext-diff',
    '--unified=3',
    '--',
    ...relativePaths,
  ])

  return {
    title: preset.name,
    content: result.ok ? result.stdout : '',
    state: result.ok && result.stdout.trim() ? 'modified' : 'modified-empty',
  }
}
