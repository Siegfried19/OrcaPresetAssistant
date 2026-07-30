import type { PresetKind, ValidationIssue } from '@shared/contracts'

type JsonRecord = Record<string, unknown>

const SETTINGS_ID_KEYS: Record<PresetKind, string> = {
  process: 'print_settings_id',
  filament: 'filament_settings_id',
  machine: 'printer_settings_id',
}

function firstString(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }

  if (Array.isArray(value)) {
    const first = value[0]
    return typeof first === 'string' ? first : ''
  }

  return ''
}

export function readSettingsId(kind: PresetKind, data: JsonRecord): string {
  return firstString(data[SETTINGS_ID_KEYS[kind]])
}

export function validatePresetIdentity(
  kind: PresetKind,
  filenameStem: string,
  data: JsonRecord,
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const name = firstString(data.name)
  const settingsId = readSettingsId(kind, data)

  if (!name) {
    issues.push('missing-internal-name')
  } else if (name !== filenameStem) {
    issues.push('filename-name-mismatch')
  }

  if (!settingsId) {
    issues.push('missing-settings-id')
  } else if (settingsId !== filenameStem) {
    issues.push('settings-id-filename-mismatch')
  }

  return issues
}

export function createPresetId(kind: PresetKind, relativePath: string): string {
  return `${kind}:${relativePath.replaceAll('\\', '/')}`
}

export function isPrintResult(value: unknown): value is 'pending' | 'success' | 'issue' | 'failed' {
  return value === 'pending' || value === 'success' || value === 'issue' || value === 'failed'
}
