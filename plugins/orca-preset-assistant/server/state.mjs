import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const LIVE_MAX_AGE_MS = 10_000
const SESSION_MAX_AGE_MS = 10_000
const PRESET_KINDS = new Set(['machine', 'process', 'filament'])
const WRITABLE_PRESET_KINDS = new Set(['process', 'filament'])
const DESTINATIONS = new Set(['current-project', 'update-current-preset', 'save-as-new-preset'])
function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''))
}

function userDataCandidates() {
  const configured = process.env.ORCA_PRESET_ASSISTANT_USER_DATA
  const roaming = process.env.APPDATA || ''
  return [
    ...(configured ? [path.resolve(configured)] : []),
    path.join(roaming, 'orca-preset-assistant'),
    path.join(roaming, 'Orca Preset Assistant'),
  ].filter((candidate, index, candidates) => candidate && candidates.indexOf(candidate) === index)
}

export function findState() {
  for (const userDataPath of userDataCandidates()) {
    const configPath = path.join(userDataPath, 'config.json')
    if (!fs.existsSync(configPath)) continue
    try {
      const config = readJson(configPath)
      if (config?.schemaVersion !== 1) continue
      return { userDataPath, config, configPath }
    } catch {
      // Ignore incomplete candidates.
    }
  }
  return null
}

export function accessStatus() {
  const state = findState()
  if (!state) {
    return {
      connected: false,
      scope: 'general',
      fileGrants: [],
      message: 'Orca Preset Assistant has not selected a workspace yet.',
    }
  }
  const permissions = state.config.codexPermissions ?? {}
  let sessionScope = null
  try {
    const session = readJson(path.join(state.userDataPath, 'codex-session.json'))
    const ageMs = Date.now() - Date.parse(session.heartbeatAt ?? '')
    if (
      session?.schemaVersion === 1 &&
      ['general', 'current-settings', 'current-project'].includes(session.scope) &&
      Number.isFinite(ageMs) &&
      ageMs >= 0 &&
      ageMs <= SESSION_MAX_AGE_MS
    ) {
      sessionScope = session.scope
    }
  } catch {
    // A missing or stale session never expands the persisted permission.
  }
  const persistedScope = ['general', 'current-settings'].includes(permissions.scope)
    ? permissions.scope
    : 'general'
  return {
    connected: true,
    workspace: state.config.workspaceRoot ?? null,
    scope: sessionScope ?? persistedScope,
    fileGrants: Array.isArray(permissions.fileGrants)
      ? permissions.fileGrants.filter((value) => typeof value === 'string')
      : [],
  }
}

export function requireScope(required) {
  const status = accessStatus()
  const rank = { general: 0, 'current-settings': 1, 'current-project': 2 }
  if (!status.connected || rank[status.scope] < rank[required]) {
    throw new Error(
      `Permission "${required}" is required. Current permission is "${status.scope}".`,
    )
  }
  if (!status.workspace || !path.isAbsolute(status.workspace)) {
    throw new Error('The configured workspace is unavailable.')
  }
  return status
}

function listJsonFiles(directory) {
  if (!fs.existsSync(directory)) return []
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory() && !entry.isSymbolicLink()) return listJsonFiles(target)
    return entry.isFile() && entry.name.toLowerCase().endsWith('.json') ? [target] : []
  })
}

export function listPresets(kind) {
  const status = requireScope('current-settings')
  if (kind !== undefined && !PRESET_KINDS.has(kind)) {
    throw new Error('kind must be machine, process, or filament.')
  }
  const root = path.join(status.workspace, 'UserPresets')
  const kinds = kind ? [kind] : [...PRESET_KINDS]
  return kinds.flatMap((presetKind) =>
    listJsonFiles(path.join(root, presetKind)).flatMap((filePath) => {
      try {
        const value = readJson(filePath)
        const relativePath = path.relative(root, filePath).replaceAll('\\', '/')
        return [
          {
            id: `${presetKind}:${relativePath}`,
            kind: presetKind,
            name: Array.isArray(value.name) ? value.name[0] : value.name,
            inherits: Array.isArray(value.inherits) ? value.inherits[0] : value.inherits,
            relativePath,
          },
        ]
      } catch {
        return []
      }
    }),
  )
}

export function readLiveState(requiredScope) {
  requireScope(requiredScope)
  const state = findState()
  const configured = process.env.ORCA_PRESET_ASSISTANT_LIVE_STATE
  const livePath = configured
    ? path.resolve(configured)
    : path.join(state.userDataPath, 'native-state.json')
  if (!fs.existsSync(livePath)) throw new Error('No live Orca state is available.')
  const live = readJson(livePath)
  const ageMs = Date.now() - Date.parse(live.generatedAt ?? '')
  if (
    live?.schemaVersion !== 1 ||
    live?.source !== 'orca-native' ||
    !Number.isFinite(ageMs) ||
    ageMs < 0 ||
    ageMs > LIVE_MAX_AGE_MS
  ) {
    throw new Error('The Orca live state is stale or unsupported.')
  }
  return live
}

function writableSettingsFromCapabilities(live, presetKind) {
  const capability = live?.writeCapabilities?.[presetKind]
  if (capability?.access !== 'controlled-write' || !Array.isArray(capability.settings)) {
    throw new Error(`No authoritative ${presetKind} write capabilities are available.`)
  }
  const keys = capability.settings
    .map((setting) => setting?.key)
    .filter((key) => typeof key === 'string' && /^[A-Za-z0-9_]+$/.test(key))
  if (keys.length !== capability.settings.length || new Set(keys).size !== keys.length) {
    throw new Error(`The authoritative ${presetKind} write capabilities are invalid.`)
  }
  return new Set(keys)
}

export function listPrintHistory() {
  const status = requireScope('current-settings')
  const root = path.join(status.workspace, 'PrintHistory')
  if (!fs.existsSync(root)) return []
  return fs
    .readdirSync(root, { withFileTypes: true })
    .flatMap((entry) => {
      if (!entry.isDirectory() || entry.isSymbolicLink() || entry.name.startsWith('.')) {
        return []
      }
      try {
        const bundle = path.join(root, entry.name)
        const record = readJson(path.join(bundle, 'record.json'))
        const settings = readJson(path.join(bundle, 'settings.json'))
        const effectiveSelections = settings.effectiveSettings?.selections
        return [
          {
            id: record.id,
            createdAt: record.createdAt,
            result: record.result,
            note: record.note,
            source: record.source,
            captureQuality: record.captureQuality,
            process: effectiveSelections?.process?.name ?? settings.process?.name ?? null,
            materials: Array.isArray(effectiveSelections?.filaments)
              ? effectiveSelections.filaments.map((item) => ({
                  name: item.name ?? null,
                  role: 'unspecified',
                }))
              : Array.isArray(settings.materials)
                ? settings.materials.map((item) => ({
                    name: item.preset?.name ?? null,
                    role: item.role ?? 'unspecified',
                  }))
                : [],
            hasProject3mf: fs.existsSync(path.join(bundle, 'project.3mf')),
          },
        ]
      } catch {
        return []
      }
    })
    .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)))
}

function parameterValue(value, depth = 0) {
  if (depth > 4) return false
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return true
  }
  if (typeof value === 'number') return Number.isFinite(value)
  return Array.isArray(value) && value.every((item) => parameterValue(item, depth + 1))
}

function parameterSnapshot(value) {
  return (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length > 0 &&
    Object.entries(value).every(
      ([key, item]) => /^[A-Za-z0-9_]+$/.test(key) && parameterValue(item),
    )
  )
}

export function queuePresetChange(input) {
  requireScope('current-settings')
  if (!DESTINATIONS.has(input?.destination)) {
    throw new Error('Choose one valid destination.')
  }
  if (!WRITABLE_PRESET_KINDS.has(input?.presetKind)) {
    throw new Error(
      'Codex writes require Orca controlled-write capabilities for process or filament presets; machine presets are read-only.',
    )
  }
  if (typeof input?.presetId !== 'string' || !input.presetId) {
    throw new Error('presetId is required.')
  }
  if (typeof input?.reason !== 'string' || !input.reason.trim() || input.reason.length > 2000) {
    throw new Error('A reason of at most 2,000 characters is required.')
  }
  if (!parameterSnapshot(input.before) || !parameterSnapshot(input.after)) {
    throw new Error('before and after must be non-empty parameter maps.')
  }
  const live = readLiveState('current-settings')
  const writableSettings = writableSettingsFromCapabilities(live, input.presetKind)
  if (
    Object.keys(input.before).some((key) => !writableSettings.has(key)) ||
    Object.keys(input.after).some((key) => !writableSettings.has(key))
  ) {
    throw new Error(
      `One or more ${input.presetKind} parameters are not present in Orca's controlled-write capabilities.`,
    )
  }
  if (
    JSON.stringify(Object.keys(input.before).sort()) !==
    JSON.stringify(Object.keys(input.after).sort())
  ) {
    throw new Error('before and after must contain the same keys.')
  }
  if (
    Object.keys(input.before).every(
      (key) => JSON.stringify(input.before[key]) === JSON.stringify(input.after[key]),
    )
  ) {
    throw new Error('The proposal must change at least one parameter.')
  }
  if (input.destination === 'save-as-new-preset' && !String(input.newPresetName ?? '').trim()) {
    throw new Error('newPresetName is required when saving a new preset.')
  }
  if (input.destination !== 'save-as-new-preset' && input.newPresetName !== undefined) {
    throw new Error('newPresetName is only valid when saving a new preset.')
  }

  const request = {
    destination: input.destination,
    presetKind: input.presetKind,
    presetId: input.presetId,
    ...(input.destination === 'save-as-new-preset'
      ? { newPresetName: String(input.newPresetName).trim() }
      : {}),
    before: input.before,
    after: input.after,
    reason: input.reason.trim(),
    requestedRevision: live.revision,
  }
  const state = findState()
  const inbox = path.join(state.userDataPath, 'mcp-inbox')
  fs.mkdirSync(inbox, { recursive: true })
  const id = randomUUID()
  const finalPath = path.join(inbox, `${id}.json`)
  const temporaryPath = `${finalPath}.tmp`
  fs.writeFileSync(temporaryPath, `${JSON.stringify(request, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  })
  fs.renameSync(temporaryPath, finalPath)
  return {
    id,
    status: 'pending-panel-approval',
    destination: request.destination,
    requestedRevision: request.requestedRevision,
  }
}
