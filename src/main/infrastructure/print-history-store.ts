import { createHash, randomUUID } from 'node:crypto'
import { copyFile, lstat, mkdir, readFile, readdir, rename, rm, stat } from 'node:fs/promises'
import { extname, isAbsolute, join, normalize, resolve } from 'node:path'

import { MATERIAL_ROLES } from '@shared/contracts'
import type {
  LatestPrintView,
  MaterialRole,
  OrcaEffectiveSettingsSnapshot,
  OrcaPresetIdentity,
  ParameterSnapshot,
  ParameterValue,
  PresetKind,
  PrintHistoryView,
  PrintResult,
  RecordedMaterialRole,
  UpdatePrintHistoryRequest,
} from '@shared/contracts'

import type {
  InternalPreset,
  PrintHistoryMaterialSnapshot,
  PrintHistoryRecord,
  PrintHistorySettings,
  PrintSnapshot,
} from '../domain/models'
import { atomicWriteJson } from './atomic-write'
import { PRINT_HISTORY_DIRECTORY, workspacePaths } from './discovery'

const MAX_JSON_BYTES = 10 * 1024 * 1024
const MAX_PROJECT_3MF_BYTES = 2 * 1024 * 1024 * 1024
const PRESET_KINDS: readonly PresetKind[] = ['machine', 'process', 'filament']
const ARCHIVE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
const NATIVE_EXPORT_DIRECTORY = '.native-exports'

interface HistoryBundle {
  readonly record: PrintHistoryRecord
  readonly settings: PrintHistorySettings
  readonly view: PrintHistoryView
}

async function fileHash(path: string): Promise<string> {
  const hash = createHash('sha256')
  hash.update(await readFile(path))
  return hash.digest('hex')
}

async function createSnapshot(preset: InternalPreset): Promise<PrintSnapshot> {
  return {
    presetId: preset.id,
    kind: preset.kind,
    name: preset.name,
    path: preset.relativePath,
    sha256: await fileHash(preset.filePath),
    customJson: preset.data,
  }
}

function isPresetKind(value: unknown): value is PresetKind {
  return PRESET_KINDS.some((kind) => kind === value)
}

function isPrintResult(value: unknown): value is PrintResult {
  return value === 'pending' || value === 'success' || value === 'issue' || value === 'failed'
}

function isMaterialRole(value: unknown): value is MaterialRole {
  return MATERIAL_ROLES.some((role) => role === value)
}

function isRecordedMaterialRole(value: unknown): value is RecordedMaterialRole {
  return value === 'unspecified' || isMaterialRole(value)
}

function isParameterValue(value: unknown, depth = 0): value is ParameterValue {
  if (depth > 5) return false
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
    Object.values(value).every((item) => isParameterValue(item))
  )
}

function isEffectiveSettings(value: unknown): value is OrcaEffectiveSettingsSnapshot {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return (
    record.authority === 'orca' &&
    typeof record.revision === 'number' &&
    Number.isSafeInteger(record.revision) &&
    record.revision >= 0 &&
    isParameterSnapshot(record.effective) &&
    Object.keys(record.effective as ParameterSnapshot).length > 0 &&
    isPresetSelections(record.selections)
  )
}

function isPresetIdentity(value: unknown): value is OrcaPresetIdentity {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return (
    typeof record.name === 'string' &&
    Boolean(record.name) &&
    typeof record.isSystem === 'boolean' &&
    typeof record.isUser === 'boolean' &&
    typeof record.isDefault === 'boolean' &&
    typeof record.isExternal === 'boolean' &&
    typeof record.isProjectEmbedded === 'boolean' &&
    typeof record.isDirty === 'boolean' &&
    typeof record.canOverwrite === 'boolean'
  )
}

function isPresetSelections(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return (
    isPresetIdentity(record.machine) &&
    isPresetIdentity(record.process) &&
    Array.isArray(record.filaments) &&
    record.filaments.length > 0 &&
    record.filaments.every(isPresetIdentity)
  )
}

function isSafeRelativePath(value: unknown): value is string {
  if (typeof value !== 'string' || !value || value.includes('\0') || isAbsolute(value)) {
    return false
  }
  const normalized = normalize(value).replaceAll('\\', '/')
  return normalized !== '..' && !normalized.startsWith('../')
}

function isPrintSnapshot(value: unknown): value is PrintSnapshot {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return (
    typeof record.presetId === 'string' &&
    isPresetKind(record.kind) &&
    typeof record.name === 'string' &&
    isSafeRelativePath(record.path) &&
    typeof record.sha256 === 'string' &&
    typeof record.customJson === 'object' &&
    record.customJson !== null &&
    !Array.isArray(record.customJson)
  )
}

function isMaterialSnapshot(value: unknown): value is PrintHistoryMaterialSnapshot {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return isRecordedMaterialRole(record.role) && isPrintSnapshot(record.preset)
}

export function parsePrintHistoryRecord(value: unknown): PrintHistoryRecord | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  if (
    record.schemaVersion !== 1 ||
    typeof record.id !== 'string' ||
    !record.id ||
    typeof record.createdAt !== 'string' ||
    Number.isNaN(Date.parse(record.createdAt)) ||
    typeof record.updatedAt !== 'string' ||
    Number.isNaN(Date.parse(record.updatedAt)) ||
    (record.source !== 'manual' && record.source !== 'orca-submission') ||
    (record.captureQuality !== 'orca-effective' &&
      record.captureQuality !== 'custom-presets-only') ||
    !isPrintResult(record.result) ||
    typeof record.note !== 'string' ||
    (record.nativeArchiveId !== null &&
      (typeof record.nativeArchiveId !== 'string' ||
        !ARCHIVE_ID_PATTERN.test(record.nativeArchiveId))) ||
    (record.processPresetId !== null && typeof record.processPresetId !== 'string') ||
    !Array.isArray(record.materials)
  ) {
    return null
  }

  const materialsAreValid = record.materials.every((value) => {
    if (typeof value !== 'object' || value === null) return false
    const material = value as Record<string, unknown>
    return (
      (material.presetId === null || typeof material.presetId === 'string') &&
      isRecordedMaterialRole(material.role)
    )
  })
  return materialsAreValid ? (value as PrintHistoryRecord) : null
}

export function parsePrintHistorySettings(value: unknown): PrintHistorySettings | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  if (
    record.schemaVersion !== 1 ||
    typeof record.capturedAt !== 'string' ||
    Number.isNaN(Date.parse(record.capturedAt)) ||
    (record.captureQuality !== 'orca-effective' &&
      record.captureQuality !== 'custom-presets-only') ||
    !Array.isArray(record.materials) ||
    !record.materials.every(isMaterialSnapshot) ||
    (record.captureQuality === 'orca-effective'
      ? !isEffectiveSettings(record.effectiveSettings) ||
        record.process !== null ||
        record.materials.length !== 0
      : record.effectiveSettings !== null || !isPrintSnapshot(record.process))
  ) {
    return null
  }
  return value as PrintHistorySettings
}

async function readJson(path: string): Promise<unknown> {
  const fileStat = await stat(path)
  if (!fileStat.isFile() || fileStat.size > MAX_JSON_BYTES) {
    throw new Error('invalid-print-history-file')
  }
  return JSON.parse(await readFile(path, 'utf8')) as unknown
}

async function isRegularFile(path: string): Promise<boolean> {
  try {
    const value = await lstat(path)
    return value.isFile() && !value.isSymbolicLink()
  } catch {
    return false
  }
}

function recordsMatchSettings(record: PrintHistoryRecord, settings: PrintHistorySettings): boolean {
  if (settings.captureQuality === 'orca-effective') {
    return record.processPresetId === null && record.materials.length === 0
  }
  if (!settings.process) return false
  if (record.processPresetId !== settings.process.presetId) return false
  if (record.materials.length !== settings.materials.length) return false

  return record.materials.every((material, index) => {
    const snapshot = settings.materials[index]
    return material.presetId === snapshot?.preset.presetId && material.role === snapshot.role
  })
}

async function readBundle(
  printHistoryRoot: string,
  directoryName: string,
): Promise<HistoryBundle | null> {
  const bundlePath = join(printHistoryRoot, directoryName)
  try {
    const record = parsePrintHistoryRecord(await readJson(join(bundlePath, 'record.json')))
    const settings = parsePrintHistorySettings(await readJson(join(bundlePath, 'settings.json')))
    if (
      !record ||
      !settings ||
      record.id !== directoryName ||
      !recordsMatchSettings(record, settings)
    ) {
      return null
    }

    const effective = settings.effectiveSettings
    const machine = effective ? { presetId: null, name: effective.selections.machine.name } : null
    const process = effective
      ? { presetId: null, name: effective.selections.process.name }
      : {
          presetId: settings.process?.presetId ?? null,
          name: settings.process?.name ?? '',
        }
    const materials = effective
      ? effective.selections.filaments.map((selection) => ({
          presetId: null,
          name: selection.name,
          role: 'unspecified' as const,
        }))
      : settings.materials.map((material) => ({
          presetId: material.preset.presetId,
          name: material.preset.name,
          role: material.role,
        }))
    const view: PrintHistoryView = {
      id: record.id,
      createdAt: record.createdAt,
      result: record.result,
      note: record.note,
      relativePath: `${PRINT_HISTORY_DIRECTORY}/${record.id}`,
      source: record.source,
      captureQuality: record.captureQuality,
      machine,
      process,
      materials,
      hasProject3mf: await isRegularFile(join(bundlePath, 'project.3mf')),
      effectiveSettings: effective?.effective ?? null,
    }
    return { record, settings, view }
  } catch {
    return null
  }
}

async function readBundles(workspaceRoot: string): Promise<HistoryBundle[]> {
  const printHistoryRoot = workspacePaths(workspaceRoot).printHistory
  let entries
  try {
    entries = await readdir(printHistoryRoot, { withFileTypes: true })
  } catch {
    return []
  }

  const bundles = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => readBundle(printHistoryRoot, entry.name)),
  )
  return bundles
    .filter((bundle): bundle is HistoryBundle => bundle !== null)
    .sort((left, right) => right.record.createdAt.localeCompare(left.record.createdAt))
}

export async function listPrintHistory(workspaceRoot: string): Promise<PrintHistoryView[]> {
  return (await readBundles(workspaceRoot)).map((bundle) => bundle.view)
}

export async function resolvePrintHistoryBundlePath(
  workspaceRoot: string,
  id: string,
): Promise<string> {
  if (!/^run-[0-9]{17}-[0-9a-f]{8}$/u.test(id)) {
    throw new Error('print-history-not-found')
  }
  const printHistoryRoot = workspacePaths(workspaceRoot).printHistory
  const bundle = await readBundle(printHistoryRoot, id)
  if (!bundle) throw new Error('print-history-not-found')
  return join(printHistoryRoot, id)
}

export async function validateProject3mf(path: string): Promise<string> {
  if (typeof path !== 'string' || !isAbsolute(path) || extname(path).toLowerCase() !== '.3mf') {
    throw new Error('invalid-project-3mf')
  }
  const absolutePath = resolve(path)
  const value = await lstat(absolutePath).catch(() => null)
  if (
    !value ||
    !value.isFile() ||
    value.isSymbolicLink() ||
    value.size <= 0 ||
    value.size > MAX_PROJECT_3MF_BYTES
  ) {
    throw new Error('invalid-project-3mf')
  }
  return absolutePath
}

export async function updatePrintHistoryRecord(
  workspaceRoot: string,
  request: UpdatePrintHistoryRequest,
): Promise<PrintHistoryView> {
  if (
    !/^run-[0-9]{17}-[0-9a-f]{8}$/u.test(request.id) ||
    !isPrintResult(request.result) ||
    typeof request.note !== 'string' ||
    request.note.length > 2_000
  ) {
    throw new Error('print-history-not-found')
  }
  const paths = workspacePaths(workspaceRoot)
  const bundle = await readBundle(paths.printHistory, request.id)
  if (!bundle) throw new Error('print-history-not-found')

  const record: PrintHistoryRecord = {
    ...bundle.record,
    updatedAt: new Date().toISOString(),
    result: request.result,
    note: request.note.trim(),
  }
  await atomicWriteJson(join(paths.printHistory, request.id, 'record.json'), record)
  const updated = await readBundle(paths.printHistory, request.id)
  if (!updated) throw new Error('print-history-not-found')
  return updated.view
}

async function snapshotIsCurrent(
  userPresetsRoot: string,
  snapshot: PrintSnapshot,
): Promise<boolean> {
  if (!isSafeRelativePath(snapshot.path)) return false
  try {
    return (await fileHash(join(userPresetsRoot, snapshot.path))) === snapshot.sha256
  } catch {
    return false
  }
}

export async function applyLatestPrints(
  workspaceRoot: string,
  presets: InternalPreset[],
): Promise<void> {
  const userPresetsRoot = workspacePaths(workspaceRoot).userPresets
  const byId = new Map(presets.map((preset) => [preset.id, preset]))

  for (const bundle of await readBundles(workspaceRoot)) {
    if (bundle.settings.effectiveSettings) {
      const selections = bundle.settings.effectiveSettings.selections
      const matched = presets.filter(
        (preset) =>
          (preset.kind === 'process' && preset.name === selections.process.name) ||
          (preset.kind === 'filament' &&
            selections.filaments.some((selection) => selection.name === preset.name)),
      )
      const view: LatestPrintView = {
        eventId: bundle.record.id,
        printedAt: bundle.record.createdAt,
        result: bundle.record.result,
        note: bundle.record.note,
        currentVersion: false,
        materials: selections.filaments.map((selection) => ({
          name: selection.name,
          role: 'unspecified',
        })),
      }
      for (const preset of matched) {
        if (preset.latestPrint === null) preset.latestPrint = view
      }
      continue
    }
    if (!bundle.settings.process) continue
    const snapshots = [
      bundle.settings.process,
      ...bundle.settings.materials.map((material) => material.preset),
    ]
    const currentVersion = (
      await Promise.all(snapshots.map((snapshot) => snapshotIsCurrent(userPresetsRoot, snapshot)))
    ).every(Boolean)
    const view: LatestPrintView = {
      eventId: bundle.record.id,
      printedAt: bundle.record.createdAt,
      result: bundle.record.result,
      note: bundle.record.note,
      currentVersion,
      materials: bundle.settings.materials.map((material) => ({
        name: material.preset.name,
        role: material.role,
      })),
    }

    for (const snapshot of snapshots) {
      const preset = byId.get(snapshot.presetId)
      if (preset && preset.latestPrint === null) {
        preset.latestPrint = view
      }
    }
  }
}

function historyId(createdAt: string): string {
  const timestamp = createdAt.replace(/\D/gu, '')
  return `run-${timestamp}-${randomUUID().slice(0, 8)}`
}

export async function createPrintHistoryBundle(
  workspaceRoot: string,
  processPreset: InternalPreset,
  materials: readonly {
    readonly preset: InternalPreset
    readonly role: MaterialRole
  }[],
  result: PrintResult,
  note: string,
  project3mfPath?: string,
): Promise<PrintHistoryView> {
  const paths = workspacePaths(workspaceRoot)
  const validatedProjectPath = project3mfPath ? await validateProject3mf(project3mfPath) : null
  const createdAt = new Date().toISOString()
  const id = historyId(createdAt)
  const temporaryPath = join(paths.printHistory, `.${id}.${randomUUID()}.tmp`)
  const finalPath = join(paths.printHistory, id)
  const materialSnapshots = await Promise.all(
    materials.map(async (material) => ({
      role: material.role,
      preset: await createSnapshot(material.preset),
    })),
  )
  const settings: PrintHistorySettings = {
    schemaVersion: 1,
    capturedAt: createdAt,
    captureQuality: 'custom-presets-only',
    effectiveSettings: null,
    process: await createSnapshot(processPreset),
    materials: materialSnapshots,
  }
  const record: PrintHistoryRecord = {
    schemaVersion: 1,
    id,
    createdAt,
    source: 'manual',
    captureQuality: settings.captureQuality,
    result,
    note: note.trim(),
    updatedAt: createdAt,
    nativeArchiveId: null,
    processPresetId: processPreset.id,
    materials: materialSnapshots.map((material) => ({
      presetId: material.preset.presetId,
      role: material.role,
    })),
  }

  await mkdir(temporaryPath)
  try {
    await atomicWriteJson(join(temporaryPath, 'record.json'), record)
    await atomicWriteJson(join(temporaryPath, 'settings.json'), settings)
    if (validatedProjectPath) {
      await copyFile(validatedProjectPath, join(temporaryPath, 'project.3mf'))
    }
    await rename(temporaryPath, finalPath)
  } catch (error) {
    await rm(temporaryPath, { force: true, recursive: true }).catch(() => undefined)
    throw error
  }

  const bundle = await readBundle(paths.printHistory, id)
  if (!bundle) throw new Error('invalid-print-history-file')
  return bundle.view
}

export async function createOrcaPrintHistoryBundle(
  workspaceRoot: string,
  archiveId: string,
  effectiveSettings: OrcaEffectiveSettingsSnapshot,
  project3mfPath?: string,
  allowExplicitProjectPath = false,
): Promise<PrintHistoryView> {
  if (!ARCHIVE_ID_PATTERN.test(archiveId)) {
    throw new Error('invalid-print-history-file')
  }
  if (!isEffectiveSettings(effectiveSettings)) {
    throw new Error('invalid-print-history-file')
  }
  const existing = (await readBundles(workspaceRoot)).find(
    (bundle) => bundle.record.nativeArchiveId === archiveId,
  )
  if (existing) {
    if (JSON.stringify(existing.settings.effectiveSettings) !== JSON.stringify(effectiveSettings)) {
      throw new Error('native-archive-conflict')
    }
    return existing.view
  }
  const paths = workspacePaths(workspaceRoot)
  const validatedProjectPath = project3mfPath ? await validateProject3mf(project3mfPath) : null
  const preparedProjectPath = join(paths.printHistory, NATIVE_EXPORT_DIRECTORY, `${archiveId}.3mf`)
  if (
    validatedProjectPath &&
    !allowExplicitProjectPath &&
    resolve(validatedProjectPath) !== resolve(preparedProjectPath)
  ) {
    throw new Error('invalid-project-3mf')
  }
  const createdAt = new Date().toISOString()
  const id = historyId(createdAt)
  const temporaryPath = join(paths.printHistory, `.${id}.${randomUUID()}.tmp`)
  const finalPath = join(paths.printHistory, id)
  const settings: PrintHistorySettings = {
    schemaVersion: 1,
    capturedAt: createdAt,
    captureQuality: 'orca-effective',
    effectiveSettings,
    process: null,
    materials: [],
  }
  const record: PrintHistoryRecord = {
    schemaVersion: 1,
    id,
    createdAt,
    source: 'orca-submission',
    captureQuality: 'orca-effective',
    result: 'pending',
    note: '',
    updatedAt: createdAt,
    nativeArchiveId: archiveId,
    processPresetId: null,
    materials: [],
  }

  await mkdir(temporaryPath)
  try {
    await atomicWriteJson(join(temporaryPath, 'record.json'), record)
    await atomicWriteJson(join(temporaryPath, 'settings.json'), settings)
    if (validatedProjectPath) {
      await copyFile(validatedProjectPath, join(temporaryPath, 'project.3mf'))
    }
    await rename(temporaryPath, finalPath)
  } catch (error) {
    await rm(temporaryPath, { force: true, recursive: true }).catch(() => undefined)
    throw error
  }

  const bundle = await readBundle(paths.printHistory, id)
  if (!bundle) throw new Error('invalid-print-history-file')
  if (validatedProjectPath && resolve(validatedProjectPath) === resolve(preparedProjectPath)) {
    await rm(validatedProjectPath, { force: true }).catch(() => undefined)
  }
  return bundle.view
}

export async function prepareProject3mfExport(
  workspaceRoot: string,
  archiveId: string,
): Promise<string> {
  if (!ARCHIVE_ID_PATTERN.test(archiveId)) {
    throw new Error('invalid-print-history-file')
  }
  const directory = join(workspacePaths(workspaceRoot).printHistory, NATIVE_EXPORT_DIRECTORY)
  await mkdir(directory).catch(async (error: unknown) => {
    const value = await lstat(directory).catch(() => null)
    if (!value?.isDirectory() || value.isSymbolicLink()) throw error
  })
  const destination = join(directory, `${archiveId}.3mf`)
  const existing = await lstat(destination).catch(() => null)
  if (existing && (!existing.isFile() || existing.isSymbolicLink())) {
    throw new Error('invalid-project-3mf')
  }
  if (existing) await rm(destination, { force: true })
  return destination
}
