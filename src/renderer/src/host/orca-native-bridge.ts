import type {
  ChangeDestination,
  OrcaPresetIdentity,
  OrcaPresetSelections,
  OrcaPresetWriteCapability,
  OrcaWriteCapabilities,
  OrcaWriteSettingCapability,
  ParameterSnapshot,
  ParameterValue,
} from '@shared/contracts'
import type { HelperJsonValue } from '@shared/helper-http'

export interface OrcaNativeBridge {
  readonly available: true
  readonly revision: number
  request(
    method: string,
    params?: Readonly<Record<string, unknown>>,
    options?: Readonly<{ expectedRevision?: number; timeoutMs?: number }>,
  ): Promise<unknown>
}

interface PendingNativeRequest {
  readonly resolve: (value: unknown) => void
  readonly reject: (reason: unknown) => void
  readonly timeout: number
}

interface OrcaNativeEnvironment {
  readonly OrcaPresetAssistant?: unknown
  readonly __ORCA_PRESET_ASSISTANT_NATIVE__?: unknown
  readonly wx?: unknown
  readonly crypto?: Readonly<{ randomUUID?: () => string }>
  addEventListener(type: string, listener: EventListener): void
  setTimeout(handler: TimerHandler, timeout?: number): number
  clearTimeout(id: number): void
}

export interface OrcaNativeEnvelope<T> {
  readonly requestId: string
  readonly ok: true
  readonly revision: number
  readonly data: T
}

export interface OrcaProposalApplyResult {
  readonly authority: 'orca'
  readonly status: 'applied' | 'unchanged'
  readonly applied: boolean
  readonly destination: ChangeDestination
  readonly targetPreset: string
  readonly before: ParameterSnapshot
  readonly after: ParameterSnapshot
  readonly rollbackGuard: {
    readonly id: string
    readonly validAtRevision: number
  }
}

export interface OrcaProposalRollbackResult {
  readonly authority: 'orca'
  readonly status: 'rolled-back'
  readonly rolledBack: true
  readonly destination: ChangeDestination
  readonly targetPreset: string
  readonly preservedNewPreset: string | null
  readonly before: ParameterSnapshot
  readonly after: ParameterSnapshot
}

export interface OrcaProjectExportResult {
  readonly authority: 'orca'
  readonly status: 'exported'
  readonly path: string
  readonly currentProjectPathChanged: false
}

export interface OrcaNativeStateResult {
  readonly presets: OrcaPresetSelections
  readonly writeCapabilities: OrcaWriteCapabilities
}

export interface OrcaNativeSettingsResult {
  readonly presets: OrcaPresetSelections
  readonly effective: ParameterSnapshot
  readonly writeCapabilities: OrcaWriteCapabilities
}

export interface OrcaPrintSubmittedResult {
  readonly archiveId: string
  readonly revision: number
  readonly presets: OrcaPresetSelections
  readonly effectiveSettings: ParameterSnapshot
  readonly project3mfPath?: string
}

export interface OrcaWorkspaceResult {
  readonly configuredWorkspace: string
  readonly activeWorkspace: string
  readonly activeUserPresetsRoot: string
  readonly restartRequired: boolean
}

const initializedBridges = new WeakMap<object, OrcaNativeBridge>()
const MUTATION_METHODS = new Set([
  'workspace.set',
  'workspace.choose',
  'project.export-copy',
  'proposal.apply',
  'proposal.rollback',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isParameterValue(value: unknown, depth = 0): value is ParameterValue {
  if (depth > 4) return false
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return true
  }
  return Array.isArray(value) && value.every((item) => isParameterValue(item, depth + 1))
}

export function isParameterSnapshot(value: unknown): value is ParameterSnapshot {
  return (
    isRecord(value) &&
    Object.keys(value).length > 0 &&
    Object.entries(value).every(
      ([key, item]) => /^[A-Za-z0-9_]+$/u.test(key) && isParameterValue(item),
    )
  )
}

function isPresetIdentity(value: unknown): value is OrcaPresetIdentity {
  return (
    isRecord(value) &&
    typeof value.name === 'string' &&
    Boolean(value.name) &&
    typeof value.isSystem === 'boolean' &&
    typeof value.isUser === 'boolean' &&
    typeof value.isDefault === 'boolean' &&
    typeof value.isExternal === 'boolean' &&
    typeof value.isProjectEmbedded === 'boolean' &&
    typeof value.isDirty === 'boolean' &&
    typeof value.canOverwrite === 'boolean'
  )
}

function isWriteSettingCapability(value: unknown): value is OrcaWriteSettingCapability {
  if (!isRecord(value)) return false
  return (
    typeof value.key === 'string' &&
    /^[A-Za-z0-9_]+$/u.test(value.key) &&
    (value.valueShape === 'scalar' || value.valueShape === 'scalar-or-vector') &&
    ['boolean', 'integer', 'number', 'percent'].includes(String(value.kind)) &&
    typeof value.minimum === 'number' &&
    Number.isFinite(value.minimum) &&
    (value.maximum === null ||
      (typeof value.maximum === 'number' && Number.isFinite(value.maximum))) &&
    (value.dynamicMaximum === undefined || typeof value.dynamicMaximum === 'string') &&
    typeof value.unit === 'string' &&
    (value.scalarBehavior === undefined ||
      value.scalarBehavior === 'broadcast-to-current-value-count') &&
    typeof value.displayLabel === 'string' &&
    Boolean(value.displayLabel) &&
    typeof value.category === 'string' &&
    ['simple', 'advanced', 'expert', 'developer'].includes(String(value.editorMode)) &&
    (value.panelVisibility === 'visible' || value.panelVisibility === 'hidden') &&
    value.verification === 'orca-readback'
  )
}

function isPresetWriteCapability(value: unknown): value is OrcaPresetWriteCapability {
  return (
    isRecord(value) &&
    (value.access === 'controlled-write' || value.access === 'read-only') &&
    Array.isArray(value.settings) &&
    value.settings.every(isWriteSettingCapability)
  )
}

export function isWriteCapabilities(value: unknown): value is OrcaWriteCapabilities {
  return (
    isRecord(value) &&
    Object.keys(value).length === 3 &&
    isPresetWriteCapability(value.process) &&
    isPresetWriteCapability(value.filament) &&
    isPresetWriteCapability(value.machine) &&
    value.process.access === 'controlled-write' &&
    value.filament.access === 'controlled-write' &&
    value.machine.access === 'read-only' &&
    value.machine.settings.length === 0
  )
}

export function isPresetSelections(value: unknown): value is OrcaPresetSelections {
  return (
    isRecord(value) &&
    isPresetIdentity(value.machine) &&
    isPresetIdentity(value.process) &&
    Array.isArray(value.filaments) &&
    value.filaments.length > 0 &&
    value.filaments.every(isPresetIdentity)
  )
}

function isHelperJsonValue(value: unknown, depth = 0): value is HelperJsonValue {
  if (depth > 12) return false
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return true
  }
  if (Array.isArray(value)) return value.every((item) => isHelperJsonValue(item, depth + 1))
  return isRecord(value) && Object.values(value).every((item) => isHelperJsonValue(item, depth + 1))
}

function isNativeStateResult(value: unknown): value is OrcaNativeStateResult {
  return (
    isRecord(value) &&
    isPresetSelections(value.presets) &&
    isWriteCapabilities(value.writeCapabilities)
  )
}

function isNativeSettingsResult(value: unknown): value is OrcaNativeSettingsResult {
  return (
    isRecord(value) &&
    isPresetSelections(value.presets) &&
    isParameterSnapshot(value.effective) &&
    isWriteCapabilities(value.writeCapabilities)
  )
}

function isWorkspaceResult(value: unknown): value is OrcaWorkspaceResult {
  return (
    isRecord(value) &&
    typeof value.configuredWorkspace === 'string' &&
    typeof value.activeWorkspace === 'string' &&
    typeof value.activeUserPresetsRoot === 'string' &&
    typeof value.restartRequired === 'boolean'
  )
}

function isChangeDestination(value: unknown): value is ChangeDestination {
  return (
    value === 'current-project' ||
    value === 'update-current-preset' ||
    value === 'save-as-new-preset'
  )
}

function existingBridge(value: unknown): OrcaNativeBridge | null {
  if (!isRecord(value)) return null
  const candidate = value.OrcaPresetAssistant
  if (!isRecord(candidate)) return null
  if (
    candidate.available !== true ||
    !Number.isSafeInteger(candidate.revision) ||
    typeof candidate.request !== 'function'
  ) {
    return null
  }
  return candidate as unknown as OrcaNativeBridge
}

export function resolveOrcaNativeBridge(value: unknown): OrcaNativeBridge | null {
  const existing = existingBridge(value)
  if (existing) return existing
  if (!isRecord(value)) return null

  const cached = initializedBridges.get(value)
  if (cached) return cached

  const environment = value as unknown as OrcaNativeEnvironment
  const bootstrap = environment.__ORCA_PRESET_ASSISTANT_NATIVE__
  const transport = environment.wx
  if (
    !isRecord(bootstrap) ||
    bootstrap.version !== 1 ||
    typeof bootstrap.token !== 'string' ||
    !bootstrap.token ||
    bootstrap.handler !== 'wx' ||
    !isRecord(transport) ||
    typeof transport.postMessage !== 'function' ||
    typeof environment.addEventListener !== 'function' ||
    typeof environment.setTimeout !== 'function' ||
    typeof environment.clearTimeout !== 'function'
  ) {
    return null
  }

  const token = bootstrap.token
  const postMessage = transport.postMessage as (message: string) => void
  const pending = new Map<string, PendingNativeRequest>()
  let revision = 1

  environment.addEventListener('orca-preset-assistant-response', (event) => {
    const response = (event as CustomEvent<unknown>).detail
    if (!isRecord(response) || typeof response.requestId !== 'string') return
    if (Number.isSafeInteger(response.revision)) revision = response.revision as number
    const waiter = pending.get(response.requestId)
    if (!waiter) return

    pending.delete(response.requestId)
    environment.clearTimeout(waiter.timeout)
    if (response.ok === true) {
      waiter.resolve(response)
      return
    }
    const nativeError = isRecord(response.error) ? response.error : {}
    waiter.reject(
      Object.assign(
        new Error(
          typeof nativeError.message === 'string'
            ? nativeError.message
            : 'Orca native request failed',
        ),
        {
          code: typeof nativeError.code === 'string' ? nativeError.code : 'NATIVE_ERROR',
          requestId: response.requestId,
          revision: response.revision,
        },
      ),
    )
  })

  const bridge: OrcaNativeBridge = {
    available: true,
    get revision() {
      return revision
    },
    request(method, params = {}, options = {}) {
      const requestId =
        environment.crypto?.randomUUID?.() ??
        `request-${Date.now()}-${Math.random().toString(16).slice(2)}`
      const expectedRevision =
        options.expectedRevision ?? (MUTATION_METHODS.has(method) ? revision : undefined)
      const envelope: Record<string, unknown> = {
        requestId,
        version: 1,
        token,
        method,
        params,
      }
      if (expectedRevision !== undefined) envelope.expectedRevision = expectedRevision

      return new Promise((resolve, reject) => {
        const timeout = environment.setTimeout(() => {
          pending.delete(requestId)
          reject(
            Object.assign(new Error(`Native request timed out: ${method}`), {
              code: 'NATIVE_TIMEOUT',
              requestId,
            }),
          )
        }, options.timeoutMs ?? 15_000)
        pending.set(requestId, { resolve, reject, timeout })
        try {
          postMessage.call(transport, JSON.stringify(envelope))
        } catch (error) {
          pending.delete(requestId)
          environment.clearTimeout(timeout)
          reject(error)
        }
      })
    },
  }
  initializedBridges.set(value, bridge)
  return bridge
}

export function parseNativeEnvelope<T>(
  value: unknown,
  isData: (data: unknown) => data is T,
): OrcaNativeEnvelope<T> {
  if (
    !isRecord(value) ||
    typeof value.requestId !== 'string' ||
    !value.requestId ||
    value.ok !== true ||
    !Number.isSafeInteger(value.revision) ||
    !isData(value.data)
  ) {
    throw new Error('invalid-orca-native-response')
  }
  return value as unknown as OrcaNativeEnvelope<T>
}

export function isProposalApplyResult(value: unknown): value is OrcaProposalApplyResult {
  if (!isRecord(value)) return false
  const rollbackGuard = value.rollbackGuard
  const validStatus =
    (value.status === 'applied' && value.applied === true) ||
    (value.status === 'unchanged' && value.applied === false)
  return (
    value.authority === 'orca' &&
    validStatus &&
    isChangeDestination(value.destination) &&
    typeof value.targetPreset === 'string' &&
    Boolean(value.targetPreset) &&
    isParameterSnapshot(value.before) &&
    isParameterSnapshot(value.after) &&
    isRecord(rollbackGuard) &&
    typeof rollbackGuard.id === 'string' &&
    Boolean(rollbackGuard.id) &&
    Number.isSafeInteger(rollbackGuard.validAtRevision)
  )
}

function isProposalRollbackResult(value: unknown): value is OrcaProposalRollbackResult {
  return (
    isRecord(value) &&
    value.authority === 'orca' &&
    value.status === 'rolled-back' &&
    value.rolledBack === true &&
    isChangeDestination(value.destination) &&
    typeof value.targetPreset === 'string' &&
    Boolean(value.targetPreset) &&
    (value.preservedNewPreset === null || typeof value.preservedNewPreset === 'string') &&
    isParameterSnapshot(value.before) &&
    isParameterSnapshot(value.after)
  )
}

function isProjectExportResult(value: unknown): value is OrcaProjectExportResult {
  return (
    isRecord(value) &&
    value.authority === 'orca' &&
    value.status === 'exported' &&
    typeof value.path === 'string' &&
    Boolean(value.path) &&
    value.currentProjectPathChanged === false
  )
}

export async function applyOrcaProposal(
  bridge: OrcaNativeBridge,
  params: Readonly<Record<string, unknown>>,
  expectedRevision: number,
): Promise<OrcaNativeEnvelope<OrcaProposalApplyResult>> {
  const response = await bridge.request('proposal.apply', params, { expectedRevision })
  return parseNativeEnvelope(response, isProposalApplyResult)
}

export async function rollbackOrcaProposal(
  bridge: OrcaNativeBridge,
  guardId: string,
  expectedRevision: number,
): Promise<OrcaNativeEnvelope<OrcaProposalRollbackResult>> {
  return parseNativeEnvelope(
    await bridge.request('proposal.rollback', { guardId }, { expectedRevision }),
    isProposalRollbackResult,
  )
}

export async function exportOrcaProjectCopy(
  bridge: OrcaNativeBridge,
  destinationPath: string,
): Promise<OrcaNativeEnvelope<OrcaProjectExportResult>> {
  return parseNativeEnvelope(
    await bridge.request(
      'project.export-copy',
      {
        authorization: 'project:export-copy',
        destinationPath,
      },
      { expectedRevision: bridge.revision },
    ),
    isProjectExportResult,
  )
}

export async function readOrcaState(
  bridge: OrcaNativeBridge,
): Promise<OrcaNativeEnvelope<OrcaNativeStateResult>> {
  return parseNativeEnvelope(await bridge.request('state.get'), isNativeStateResult)
}

export async function readOrcaSettings(
  bridge: OrcaNativeBridge,
): Promise<OrcaNativeEnvelope<OrcaNativeSettingsResult>> {
  return parseNativeEnvelope(
    await bridge.request('settings.get', { authorization: 'settings:read' }),
    isNativeSettingsResult,
  )
}

export async function readOrcaProject(
  bridge: OrcaNativeBridge,
): Promise<OrcaNativeEnvelope<Readonly<Record<string, HelperJsonValue>>>> {
  return parseNativeEnvelope(
    await bridge.request('project.get', { authorization: 'project:geometry' }),
    (value): value is Readonly<Record<string, HelperJsonValue>> =>
      isRecord(value) && isHelperJsonValue(value),
  )
}

export async function readPendingOrcaPrint(
  bridge: OrcaNativeBridge,
): Promise<OrcaNativeEnvelope<OrcaPrintSubmittedResult | null>> {
  const envelope = parseNativeEnvelope(
    await bridge.request('print.pending.get', { authorization: 'print-archive:read' }),
    (value): value is { readonly pending: OrcaPrintSubmittedResult | null } => {
      if (!isRecord(value) || !('pending' in value)) return false
      if (value.pending === null) return true
      try {
        parsePrintSubmitted(value.pending)
        return true
      } catch {
        return false
      }
    },
  )
  return {
    ...envelope,
    data: envelope.data.pending,
  }
}

export async function readOrcaWorkspace(
  bridge: OrcaNativeBridge,
): Promise<OrcaNativeEnvelope<OrcaWorkspaceResult>> {
  return parseNativeEnvelope(await bridge.request('workspace.get'), isWorkspaceResult)
}

export async function setOrcaWorkspace(
  bridge: OrcaNativeBridge,
  workspace: string,
): Promise<OrcaNativeEnvelope<OrcaWorkspaceResult>> {
  return parseNativeEnvelope(
    await bridge.request('workspace.set', { workspace }, { expectedRevision: bridge.revision }),
    isWorkspaceResult,
  )
}

export function parsePrintSubmitted(value: unknown): OrcaPrintSubmittedResult {
  if (
    !isRecord(value) ||
    typeof value.archiveId !== 'string' ||
    !value.archiveId ||
    !Number.isSafeInteger(value.revision) ||
    !isPresetSelections(value.presets) ||
    !isParameterSnapshot(value.effectiveSettings) ||
    (value.project3mfPath !== undefined &&
      (typeof value.project3mfPath !== 'string' || !value.project3mfPath))
  ) {
    throw new Error('invalid-orca-print-submission')
  }
  return value as unknown as OrcaPrintSubmittedResult
}

export function errorText(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim().slice(0, 2_000)
  return 'Orca did not apply the approved proposal.'
}
