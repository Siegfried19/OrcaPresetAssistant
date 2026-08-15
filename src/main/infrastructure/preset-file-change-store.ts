import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, readFile, readdir, rename, rm } from 'node:fs/promises'
import { basename, extname, join, posix, resolve, sep } from 'node:path'

import type {
  ParameterSnapshot,
  ParameterValue,
  PresetFileChangeView,
  PresetFileOperation,
} from '@shared/contracts'
import type { CompletePresetFileChangeRequest } from '@shared/helper-http'
import { parameterValuesEqual } from '@shared/parameter-comparison'

import { atomicWriteJson } from './atomic-write'

const INBOX_DIRECTORY = 'preset-file-change-inbox'
const QUARANTINE_DIRECTORY = 'quarantine'
const MAX_INBOX_BYTES = 1024 * 1024

interface PresetFileChangeDocument {
  readonly schemaVersion: 1
  readonly changes: readonly PresetFileChangeView[]
}

export interface PresetFileChangeInboxRequest {
  readonly operation: PresetFileOperation
  readonly presetKind: 'process' | 'filament'
  readonly presetName: string
  readonly relativePath: string
  readonly sourceRelativePath?: string
  readonly before: ParameterSnapshot
  readonly after: ParameterSnapshot
  readonly removedKeys?: readonly string[]
  readonly reason: string
  readonly beforeFileHash: string | null
}

export interface PresetFileChangeInboxImportResult {
  readonly imported: number
  readonly quarantined: number
}

const EMPTY_DOCUMENT: PresetFileChangeDocument = { schemaVersion: 1, changes: [] }

function isParameterValue(value: unknown, depth = 0): value is ParameterValue {
  if (depth > 4) return false
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    typeof value === 'number'
  ) {
    return typeof value !== 'number' || Number.isFinite(value)
  }
  return Array.isArray(value) && value.every((item) => isParameterValue(item, depth + 1))
}

function isParameterSnapshot(value: unknown): value is ParameterSnapshot {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.entries(value).every(
      ([key, item]) => /^[A-Za-z0-9_]+$/u.test(key) && isParameterValue(item),
    )
  )
}

function normalizedRelativePath(value: unknown, kind: 'process' | 'filament'): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > 512) return null
  const normalized = value.replaceAll('\\', '/')
  if (
    normalized !== posix.normalize(normalized) ||
    normalized.startsWith('/') ||
    normalized.includes('\0') ||
    normalized.split('/').some((part) => !part || part === '.' || part === '..') ||
    !normalized.startsWith(`${kind}/`) ||
    posix.extname(normalized).toLowerCase() !== '.json'
  ) {
    return null
  }
  return normalized
}

function validHash(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/u.test(value)
}

function sortedUniqueKeys(value: unknown): readonly string[] | null {
  if (!Array.isArray(value)) return null
  if (
    value.some((key) => typeof key !== 'string' || !/^[A-Za-z0-9_]+$/u.test(key)) ||
    new Set(value).size !== value.length
  ) {
    return null
  }
  return [...value].sort()
}

export function parsePresetFileChangeInboxRequest(
  value: unknown,
): PresetFileChangeInboxRequest | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const request = value as Record<string, unknown>
  const allowedKeys = new Set([
    'operation',
    'presetKind',
    'presetName',
    'relativePath',
    'sourceRelativePath',
    'before',
    'after',
    'removedKeys',
    'reason',
    'beforeFileHash',
  ])
  if (Object.keys(request).some((key) => !allowedKeys.has(key))) return null
  if (request.operation !== 'create' && request.operation !== 'update') return null
  if (request.presetKind !== 'process' && request.presetKind !== 'filament') return null
  if (
    typeof request.presetName !== 'string' ||
    !request.presetName.trim() ||
    request.presetName !== request.presetName.trim() ||
    request.presetName.length > 256 ||
    /[\\/:*?"<>|]/u.test(request.presetName)
  ) {
    return null
  }
  const relativePath = normalizedRelativePath(request.relativePath, request.presetKind)
  if (!relativePath || basename(relativePath, extname(relativePath)) !== request.presetName) {
    return null
  }
  const sourceRelativePath =
    request.sourceRelativePath === undefined
      ? null
      : normalizedRelativePath(request.sourceRelativePath, request.presetKind)
  if (request.sourceRelativePath !== undefined && !sourceRelativePath) return null
  if (!isParameterSnapshot(request.before) || !isParameterSnapshot(request.after)) return null
  const before = request.before
  const after = request.after
  const removedKeys = sortedUniqueKeys(request.removedKeys ?? [])
  if (!removedKeys) return null
  const beforeKeys = Object.keys(before).sort()
  const afterKeys = Object.keys(after).sort()
  if (
    beforeKeys.length === 0 ||
    beforeKeys.length !== afterKeys.length ||
    beforeKeys.some((key, index) => key !== afterKeys[index]) ||
    removedKeys.some((key) => !afterKeys.includes(key)) ||
    beforeKeys.every((key) => parameterValuesEqual(before[key]!, after[key]!))
  ) {
    return null
  }
  if (
    typeof request.reason !== 'string' ||
    !request.reason.trim() ||
    request.reason.length > 2_000
  ) {
    return null
  }
  const beforeFileHash = request.beforeFileHash
  if (
    (request.operation === 'create' && beforeFileHash !== null) ||
    (request.operation === 'update' && !validHash(beforeFileHash))
  ) {
    return null
  }

  return {
    operation: request.operation,
    presetKind: request.presetKind,
    presetName: request.presetName,
    relativePath,
    ...(sourceRelativePath ? { sourceRelativePath } : {}),
    before,
    after,
    removedKeys,
    reason: request.reason.trim(),
    beforeFileHash: beforeFileHash as string | null,
  }
}

function isPresetFileChange(value: unknown): value is PresetFileChangeView {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const change = value as Record<string, unknown>
  const request = parsePresetFileChangeInboxRequest({
    operation: change.operation,
    presetKind: change.presetKind,
    presetName: change.presetName,
    relativePath: change.relativePath,
    ...(change.sourceRelativePath === null
      ? {}
      : { sourceRelativePath: change.sourceRelativePath }),
    before: change.before,
    after: change.after,
    removedKeys: change.removedKeys,
    reason: change.reason,
    beforeFileHash: change.beforeFileHash,
  })
  return (
    request !== null &&
    typeof change.id === 'string' &&
    Boolean(change.id) &&
    typeof change.createdAt === 'string' &&
    !Number.isNaN(Date.parse(change.createdAt)) &&
    typeof change.updatedAt === 'string' &&
    !Number.isNaN(Date.parse(change.updatedAt)) &&
    ['planned', 'written', 'loaded', 'conflict'].includes(String(change.status)) &&
    (change.writtenFileHash === null || validHash(change.writtenFileHash)) &&
    (change.authoritativeRevision === null ||
      (typeof change.authoritativeRevision === 'string' &&
        Boolean(change.authoritativeRevision))) &&
    (change.error === null || (typeof change.error === 'string' && change.error.length <= 2_000))
  )
}

function resolveTarget(userPresetsPath: string, relativePath: string): string {
  const root = resolve(userPresetsPath)
  const target = resolve(root, ...relativePath.split('/'))
  const rootPrefix = root.endsWith(sep) ? root : `${root}${sep}`
  if (!target.startsWith(rootPrefix)) throw new Error('invalid-preset-file-path')
  return target
}

function stringValue(value: unknown): string {
  if (typeof value === 'string') return value
  return Array.isArray(value) && typeof value[0] === 'string' ? value[0] : ''
}

function settingsId(kind: 'process' | 'filament', data: Record<string, unknown>): string {
  return kind === 'process'
    ? stringValue(data.print_settings_id)
    : stringValue(data.filament_settings_id)
}

function contentHash(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex')
}

async function readVerifiedTarget(
  userPresetsPath: string,
  change: PresetFileChangeView,
): Promise<{ readonly hash: string; readonly data: Record<string, unknown> } | null> {
  const targetPath = resolveTarget(userPresetsPath, change.relativePath)
  const infoPath = targetPath.slice(0, -extname(targetPath).length) + '.info'
  try {
    const [targetStat, infoStat, content] = await Promise.all([
      lstat(targetPath),
      lstat(infoPath),
      readFile(targetPath),
    ])
    if (
      !targetStat.isFile() ||
      targetStat.isSymbolicLink() ||
      !infoStat.isFile() ||
      infoStat.isSymbolicLink()
    ) {
      return null
    }
    const parsed: unknown = JSON.parse(content.toString('utf8').replace(/^\uFEFF/u, ''))
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
    const data = parsed as Record<string, unknown>
    if (
      stringValue(data.name) !== change.presetName ||
      settingsId(change.presetKind, data) !== change.presetName
    ) {
      return null
    }
    return { hash: contentHash(content), data }
  } catch {
    return null
  }
}

function targetMatchesChange(data: Record<string, unknown>, change: PresetFileChangeView): boolean {
  const removed = new Set(change.removedKeys)
  return Object.keys(change.after).every((key) =>
    removed.has(key)
      ? !Object.prototype.hasOwnProperty.call(data, key)
      : Object.prototype.hasOwnProperty.call(data, key) &&
        parameterValuesEqual(data[key] as ParameterValue, change.after[key]!),
  )
}

export class PresetFileChangeStore {
  private readonly filePath: string
  private readonly inboxPath: string
  private readonly quarantinePath: string

  public constructor(userDataPath: string) {
    this.filePath = join(userDataPath, 'preset-file-changes.json')
    this.inboxPath = join(userDataPath, INBOX_DIRECTORY)
    this.quarantinePath = join(this.inboxPath, QUARANTINE_DIRECTORY)
  }

  public async list(): Promise<readonly PresetFileChangeView[]> {
    return (await this.read()).changes
  }

  public async importInbox(): Promise<PresetFileChangeInboxImportResult> {
    await mkdir(this.inboxPath, { recursive: true })
    const entries = await readdir(this.inboxPath, { withFileTypes: true })
    let imported = 0
    let quarantined = 0

    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (entry.name.endsWith('.tmp') || entry.name === QUARANTINE_DIRECTORY) continue
      const sourcePath = join(this.inboxPath, entry.name)
      const requestId = basename(entry.name, extname(entry.name))
      try {
        const fileStat = await lstat(sourcePath)
        if (
          !fileStat.isFile() ||
          fileStat.isSymbolicLink() ||
          extname(entry.name).toLowerCase() !== '.json' ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
            requestId,
          ) ||
          fileStat.size <= 0 ||
          fileStat.size > MAX_INBOX_BYTES
        ) {
          throw new Error('invalid-inbox-request')
        }
        const request = parsePresetFileChangeInboxRequest(
          JSON.parse((await readFile(sourcePath, 'utf8')).replace(/^\uFEFF/u, '')),
        )
        if (!request) throw new Error('invalid-inbox-request')
        await this.queueValidated(request, requestId)
        await rm(sourcePath, { force: true })
        imported += 1
      } catch {
        await this.quarantine(sourcePath)
        quarantined += 1
      }
    }
    return { imported, quarantined }
  }

  public async reconcileDisk(userPresetsPath: string): Promise<readonly PresetFileChangeView[]> {
    const document = await this.read()
    const changes = await Promise.all(
      document.changes.map(async (change): Promise<PresetFileChangeView> => {
        const target = await readVerifiedTarget(userPresetsPath, change)
        if (!target) {
          if (change.operation === 'create' && change.status === 'planned') return change
          return {
            ...change,
            updatedAt: new Date().toISOString(),
            status: 'conflict',
            authoritativeRevision: null,
            error: 'preset-file-missing-or-invalid',
          }
        }
        if (targetMatchesChange(target.data, change)) {
          if (
            change.status === 'loaded' &&
            change.writtenFileHash === target.hash &&
            change.error === null
          ) {
            return change
          }
          return {
            ...change,
            updatedAt: new Date().toISOString(),
            status: 'written',
            writtenFileHash: target.hash,
            authoritativeRevision: null,
            error: null,
          }
        }
        if (
          change.operation === 'update' &&
          change.beforeFileHash === target.hash &&
          change.status === 'planned'
        ) {
          return change
        }
        return {
          ...change,
          updatedAt: new Date().toISOString(),
          status: 'conflict',
          writtenFileHash: null,
          authoritativeRevision: null,
          error: 'preset-file-content-does-not-match-log',
        }
      }),
    )
    if (JSON.stringify(changes) !== JSON.stringify(document.changes)) {
      await this.write({ schemaVersion: 1, changes })
    }
    return changes
  }

  public async complete(
    userPresetsPath: string,
    request: CompletePresetFileChangeRequest,
  ): Promise<PresetFileChangeView> {
    if (!request || typeof request.id !== 'string' || !request.id) {
      throw new Error('invalid-authoritative-receipt')
    }
    const document = await this.read()
    const index = document.changes.findIndex((change) => change.id === request.id)
    const existing = document.changes[index]
    const receipt = request.receipt
    if (
      !existing ||
      (existing.status !== 'written' && existing.status !== 'loaded') ||
      receipt?.authority !== 'orca' ||
      receipt.status !== 'loaded' ||
      typeof receipt.revision !== 'string' ||
      !receipt.revision ||
      receipt.presetKind !== existing.presetKind ||
      receipt.presetName !== existing.presetName ||
      receipt.relativePath !== existing.relativePath ||
      !isParameterSnapshot(receipt.values)
    ) {
      throw new Error('invalid-authoritative-receipt')
    }
    const absentKeys = sortedUniqueKeys(receipt.absentKeys)
    const expectedAbsent = [...existing.removedKeys].sort()
    if (
      !absentKeys ||
      JSON.stringify(absentKeys) !== JSON.stringify(expectedAbsent) ||
      Object.keys(existing.after).some((key) =>
        expectedAbsent.includes(key)
          ? Object.prototype.hasOwnProperty.call(receipt.values, key)
          : !Object.prototype.hasOwnProperty.call(receipt.values, key) ||
            !parameterValuesEqual(receipt.values[key]!, existing.after[key]!),
      )
    ) {
      throw new Error('invalid-authoritative-receipt')
    }
    const target = await readVerifiedTarget(userPresetsPath, existing)
    if (
      !target ||
      target.hash !== existing.writtenFileHash ||
      !targetMatchesChange(target.data, existing)
    ) {
      throw new Error('invalid-authoritative-receipt')
    }

    const updated: PresetFileChangeView = {
      ...existing,
      updatedAt: new Date().toISOString(),
      status: 'loaded',
      authoritativeRevision: receipt.revision,
      error: null,
    }
    const changes = [...document.changes]
    changes[index] = updated
    await this.write({ schemaVersion: 1, changes })
    return updated
  }

  private async queueValidated(
    request: PresetFileChangeInboxRequest,
    id: string = randomUUID(),
  ): Promise<PresetFileChangeView> {
    const document = await this.read()
    const existing = document.changes.find((change) => change.id === id)
    if (existing) return existing
    const now = new Date().toISOString()
    const change: PresetFileChangeView = {
      id,
      createdAt: now,
      updatedAt: now,
      operation: request.operation,
      presetKind: request.presetKind,
      presetName: request.presetName,
      relativePath: request.relativePath,
      sourceRelativePath: request.sourceRelativePath ?? null,
      before: request.before,
      after: request.after,
      removedKeys: request.removedKeys ?? [],
      reason: request.reason,
      status: 'planned',
      beforeFileHash: request.beforeFileHash,
      writtenFileHash: null,
      authoritativeRevision: null,
      error: null,
    }
    await this.write({ schemaVersion: 1, changes: [change, ...document.changes] })
    return change
  }

  private async read(): Promise<PresetFileChangeDocument> {
    try {
      const value: unknown = JSON.parse(await readFile(this.filePath, 'utf8'))
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return EMPTY_DOCUMENT
      }
      const document = value as Record<string, unknown>
      if (document.schemaVersion !== 1 || !Array.isArray(document.changes)) return EMPTY_DOCUMENT
      return { schemaVersion: 1, changes: document.changes.filter(isPresetFileChange) }
    } catch {
      return EMPTY_DOCUMENT
    }
  }

  private async write(document: PresetFileChangeDocument): Promise<void> {
    await atomicWriteJson(this.filePath, document)
  }

  private async quarantine(sourcePath: string): Promise<void> {
    await mkdir(this.quarantinePath, { recursive: true })
    const targetPath = join(this.quarantinePath, `${basename(sourcePath)}.${randomUUID()}.rejected`)
    await rename(sourcePath, targetPath).catch(async () => {
      await rm(sourcePath, { force: true, recursive: true }).catch(() => undefined)
    })
  }
}
