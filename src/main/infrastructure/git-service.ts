import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { promisify } from 'node:util'

import type { DiffStats, GitState, PresetDiff, PresetVersionView } from '@shared/contracts'

import type { InternalPreset } from '../domain/models'

const execFileAsync = promisify(execFile)

interface GitCommandResult {
  readonly ok: boolean
  readonly stdout: string
}

export interface GitSnapshot {
  readonly isRepository: boolean
  readonly states: ReadonlyMap<string, string>
  readonly latestVersion: PresetVersionView | null
}

const PRESET_PATHS = ['machine', 'process', 'filament'] as const
const VERSION_RECORD_SEPARATOR = '\u001f'
const VERSION_RECORD_TERMINATOR = '\u0000'

function normalizeGitPath(path: string): string {
  return path.replaceAll('\\', '/')
}

function normalizeFsPath(path: string): string {
  return resolve(path).replaceAll('\\', '/').replace(/\/+$/u, '').toLocaleLowerCase('en-US')
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
  const topLevel = await runGit(rootPath, ['rev-parse', '--show-toplevel'])
  if (!topLevel.ok || normalizeFsPath(topLevel.stdout.trim()) !== normalizeFsPath(rootPath)) {
    return {
      isRepository: false,
      states: new Map(),
      latestVersion: null,
    }
  }

  const result = await runGit(rootPath, ['status', '--porcelain=v1', '-z', '--untracked-files=all'])
  const [latestVersion] = await readPresetVersions(rootPath, 1)

  return {
    isRepository: result.ok,
    states: result.ok ? parsePorcelainStatus(result.stdout) : new Map(),
    latestVersion: latestVersion ?? null,
  }
}

function parseVersionRecord(record: string): PresetVersionView | null {
  const [revision, shortRevision, createdAt, ...messageParts] =
    record.split(VERSION_RECORD_SEPARATOR)
  const message = messageParts.join(VERSION_RECORD_SEPARATOR)
  if (
    !/^[0-9a-f]{40}$/u.test(revision ?? '') ||
    !/^[0-9a-f]{7,40}$/u.test(shortRevision ?? '') ||
    !createdAt ||
    Number.isNaN(new Date(createdAt).getTime()) ||
    !message
  ) {
    return null
  }
  return { revision: revision!, shortRevision: shortRevision!, createdAt, message }
}

export async function readPresetVersions(
  rootPath: string,
  limit = 50,
): Promise<readonly PresetVersionView[]> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error('git-operation-failed')
  }
  const result = await runGit(rootPath, [
    'log',
    `--max-count=${limit}`,
    '-z',
    `--format=%H%x1f%h%x1f%aI%x1f%s`,
    '--',
    ...PRESET_PATHS,
  ])
  if (!result.ok || !result.stdout) return []
  return result.stdout
    .split(VERSION_RECORD_TERMINATOR)
    .map((record) => parseVersionRecord(record))
    .filter((version): version is PresetVersionView => version !== null)
}

async function requirePresetRepository(rootPath: string): Promise<void> {
  const snapshot = await readGitSnapshot(rootPath)
  if (!snapshot.isRepository) throw new Error('git-unavailable')
}

async function hasPresetChanges(rootPath: string): Promise<boolean> {
  const result = await runGit(rootPath, [
    'status',
    '--porcelain=v1',
    '-z',
    '--untracked-files=all',
    '--',
    ...PRESET_PATHS,
  ])
  if (!result.ok) throw new Error('git-operation-failed')
  return Boolean(result.stdout)
}

async function hasStagedChangesOutsidePresets(rootPath: string): Promise<boolean> {
  const result = await runGit(rootPath, ['diff', '--cached', '--name-only', '-z'])
  if (!result.ok) throw new Error('git-operation-failed')
  return result.stdout
    .split('\0')
    .filter(Boolean)
    .some((path) => !PRESET_PATHS.some((directory) => path.startsWith(`${directory}/`)))
}

async function trackedPresetPaths(rootPath: string, revision: string): Promise<readonly string[]> {
  const result = await runGit(rootPath, [
    'ls-tree',
    '-r',
    '--name-only',
    '-z',
    revision,
    '--',
    ...PRESET_PATHS,
  ])
  if (!result.ok) throw new Error('git-history-not-found')
  return result.stdout.split('\0').filter(Boolean)
}

async function commitIdentityArgs(rootPath: string): Promise<readonly string[]> {
  const [name, email] = await Promise.all([
    runGit(rootPath, ['config', '--get', 'user.name']),
    runGit(rootPath, ['config', '--get', 'user.email']),
  ])
  if (name.ok && name.stdout.trim() && email.ok && email.stdout.trim()) return []
  return [
    '-c',
    'user.name=Orca Preset Assistant',
    '-c',
    'user.email=local@orca-preset-assistant.invalid',
  ]
}

async function commitPresetPaths(rootPath: string, message: string): Promise<void> {
  const identity = await commitIdentityArgs(rootPath)
  const result = await runGit(rootPath, [...identity, 'commit', '-m', message])
  if (!result.ok) throw new Error('git-operation-failed')
}

export async function initializePresetRepository(rootPath: string): Promise<void> {
  const current = await readGitSnapshot(rootPath)
  if (current.isRepository) return
  const result = await runGit(rootPath, ['init'])
  if (!result.ok) throw new Error('git-operation-failed')
  await requirePresetRepository(rootPath)
}

export async function savePresetVersion(rootPath: string, message: string): Promise<void> {
  const normalizedMessage = message.trim().replace(/\s+/gu, ' ')
  if (!normalizedMessage || normalizedMessage.length > 120) {
    throw new Error('invalid-version-message')
  }
  await requirePresetRepository(rootPath)
  if (await hasStagedChangesOutsidePresets(rootPath)) {
    throw new Error('git-working-tree-dirty')
  }
  if (!(await hasPresetChanges(rootPath))) throw new Error('git-nothing-to-save')
  const staged = await runGit(rootPath, ['add', '--all', '--', ...PRESET_PATHS])
  if (!staged.ok) throw new Error('git-operation-failed')
  await commitPresetPaths(rootPath, normalizedMessage)
}

export async function restorePresetVersion(rootPath: string, revision: string): Promise<void> {
  if (!/^[0-9a-f]{7,40}$/u.test(revision)) throw new Error('git-history-not-found')
  await requirePresetRepository(rootPath)
  if (await hasStagedChangesOutsidePresets(rootPath)) {
    throw new Error('git-working-tree-dirty')
  }
  if (await hasPresetChanges(rootPath)) throw new Error('git-working-tree-dirty')

  const reachable = await runGit(rootPath, ['merge-base', '--is-ancestor', revision, 'HEAD'])
  if (!reachable.ok) throw new Error('git-history-not-found')
  const target = await runGit(rootPath, ['show', '-s', '--format=%h%x1f%s', revision])
  const [shortRevision, ...subjectParts] = target.stdout.trim().split(VERSION_RECORD_SEPARATOR)
  if (!target.ok || !shortRevision) throw new Error('git-history-not-found')

  const [currentPaths, targetPaths] = await Promise.all([
    trackedPresetPaths(rootPath, 'HEAD'),
    trackedPresetPaths(rootPath, revision),
  ])
  const paths = [...new Set([...currentPaths, ...targetPaths])]
  if (paths.length === 0) throw new Error('git-nothing-to-save')
  const restored = await runGit(rootPath, [
    'restore',
    `--source=${revision}`,
    '--staged',
    '--worktree',
    '--',
    ...paths,
  ])
  if (!restored.ok) throw new Error('git-operation-failed')
  if (!(await hasPresetChanges(rootPath))) throw new Error('git-nothing-to-save')

  const subject = subjectParts.join(VERSION_RECORD_SEPARATOR)
  await commitPresetPaths(
    rootPath,
    `Restore preset version ${shortRevision}${subject ? `: ${subject}` : ''}`,
  )
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
