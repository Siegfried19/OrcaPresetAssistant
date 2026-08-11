import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import type {
  CodexPermissionScope,
  OrcaPresetIdentity,
  OrcaPresetWriteCapability,
  OrcaPresetSelections,
  OrcaWriteCapabilities,
  OrcaWriteSettingCapability,
  ParameterSnapshot,
  ParameterValue,
} from '@shared/contracts'
import type {
  HelperJsonValue,
  PublishNativeStateRequest,
  PublishedNativeState,
} from '@shared/helper-http'

import { atomicWriteJson } from './atomic-write'

const MAX_FRESH_AGE_MS = 10_000

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
    Object.keys(value).length > 0 &&
    Object.entries(value).every(
      ([key, item]) => /^[A-Za-z0-9_]+$/u.test(key) && isParameterValue(item),
    )
  )
}

function isPresetIdentity(value: unknown): value is OrcaPresetIdentity {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort()
  return (
    JSON.stringify(keys) ===
      JSON.stringify(
        [
          'canOverwrite',
          'isDefault',
          'isDirty',
          'isExternal',
          'isProjectEmbedded',
          'isSystem',
          'isUser',
          'name',
        ].sort(),
      ) &&
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

function isSelections(value: unknown): value is OrcaPresetSelections {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return (
    Object.keys(record).length === 3 &&
    isPresetIdentity(record.machine) &&
    isPresetIdentity(record.process) &&
    Array.isArray(record.filaments) &&
    record.filaments.length > 0 &&
    record.filaments.every(isPresetIdentity)
  )
}

function isWriteSettingCapability(value: unknown): value is OrcaWriteSettingCapability {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return (
    typeof record.key === 'string' &&
    /^[A-Za-z0-9_]+$/u.test(record.key) &&
    (record.valueShape === 'scalar' || record.valueShape === 'scalar-or-vector') &&
    ['boolean', 'integer', 'number', 'percent'].includes(String(record.kind)) &&
    typeof record.minimum === 'number' &&
    Number.isFinite(record.minimum) &&
    (record.maximum === null ||
      (typeof record.maximum === 'number' && Number.isFinite(record.maximum))) &&
    (record.dynamicMaximum === undefined || typeof record.dynamicMaximum === 'string') &&
    typeof record.unit === 'string' &&
    (record.scalarBehavior === undefined ||
      record.scalarBehavior === 'broadcast-to-current-value-count') &&
    typeof record.displayLabel === 'string' &&
    Boolean(record.displayLabel) &&
    typeof record.category === 'string' &&
    ['simple', 'advanced', 'expert', 'developer'].includes(String(record.editorMode)) &&
    (record.panelVisibility === 'visible' || record.panelVisibility === 'hidden') &&
    record.verification === 'orca-readback'
  )
}

function isPresetWriteCapability(value: unknown): value is OrcaPresetWriteCapability {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return (
    (record.access === 'controlled-write' || record.access === 'read-only') &&
    Array.isArray(record.settings) &&
    record.settings.every(isWriteSettingCapability)
  )
}

function isWriteCapabilities(value: unknown): value is OrcaWriteCapabilities {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return (
    Object.keys(record).length === 3 &&
    isPresetWriteCapability(record.process) &&
    isPresetWriteCapability(record.filament) &&
    isPresetWriteCapability(record.machine) &&
    record.process.access === 'controlled-write' &&
    record.filament.access === 'controlled-write' &&
    record.machine.access === 'read-only' &&
    record.machine.settings.length === 0
  )
}

function isJsonValue(value: unknown, depth = 0): value is HelperJsonValue {
  if (depth > 8) return false
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    typeof value === 'number'
  ) {
    return typeof value !== 'number' || Number.isFinite(value)
  }
  if (Array.isArray(value)) return value.every((item) => isJsonValue(item, depth + 1))
  return (
    typeof value === 'object' &&
    Object.entries(value as Record<string, unknown>).every(
      ([key, item]) => key.length <= 128 && isJsonValue(item, depth + 1),
    )
  )
}

function validateRequest(value: unknown): PublishNativeStateRequest {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('invalid-native-state')
  }
  const record = value as Record<string, unknown>
  if (
    Object.keys(record).some(
      (key) =>
        key !== 'revision' &&
        key !== 'selections' &&
        key !== 'writeCapabilities' &&
        key !== 'settings' &&
        key !== 'project',
    ) ||
    typeof record.revision !== 'number' ||
    !Number.isSafeInteger(record.revision) ||
    record.revision < 0 ||
    !isSelections(record.selections) ||
    !isWriteCapabilities(record.writeCapabilities) ||
    (record.settings !== undefined && !isParameterSnapshot(record.settings)) ||
    (record.project !== undefined &&
      (typeof record.project !== 'object' ||
        record.project === null ||
        Array.isArray(record.project) ||
        !isJsonValue(record.project)))
  ) {
    throw new Error('invalid-native-state')
  }
  return value as PublishNativeStateRequest
}

function isPublishedState(value: unknown): value is PublishedNativeState {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return (
    record.schemaVersion === 1 &&
    record.source === 'orca-native' &&
    typeof record.generatedAt === 'string' &&
    !Number.isNaN(Date.parse(record.generatedAt)) &&
    typeof record.revision === 'string' &&
    /^[0-9]+$/u.test(record.revision) &&
    isSelections(record.selections) &&
    isWriteCapabilities(record.writeCapabilities) &&
    (record.settings === undefined || isParameterSnapshot(record.settings)) &&
    (record.project === undefined || isJsonValue(record.project))
  )
}

export class NativeStateStore {
  private readonly filePath: string

  public constructor(userDataPath: string) {
    this.filePath = join(userDataPath, 'native-state.json')
  }

  public async publish(scope: CodexPermissionScope, value: unknown): Promise<PublishedNativeState> {
    const request = validateRequest(value)
    if (scope !== 'general' && request.settings === undefined) {
      throw new Error('invalid-native-state')
    }
    if (scope === 'current-project' && request.project === undefined) {
      throw new Error('invalid-native-state')
    }
    const state: PublishedNativeState = {
      schemaVersion: 1,
      source: 'orca-native',
      generatedAt: new Date().toISOString(),
      revision: String(request.revision),
      selections: request.selections,
      writeCapabilities: request.writeCapabilities,
      ...(scope === 'general' ? {} : { settings: request.settings }),
      ...(scope === 'current-project' ? { project: request.project } : {}),
    }
    await atomicWriteJson(this.filePath, state)
    return state
  }

  public async readFresh(now = Date.now()): Promise<PublishedNativeState | null> {
    try {
      const value: unknown = JSON.parse(await readFile(this.filePath, 'utf8'))
      if (!isPublishedState(value)) return null
      const age = now - Date.parse(value.generatedAt)
      return age >= 0 && age <= MAX_FRESH_AGE_MS ? value : null
    } catch {
      return null
    }
  }
}
