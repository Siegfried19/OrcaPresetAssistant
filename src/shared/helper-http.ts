import type {
  ApproveChangeProposalRequest,
  ChangeProposalView,
  CodexPermissionScope,
  DashboardSnapshot,
  GuardProposalRollbackRequest,
  Language,
  OrcaEffectiveSettingsSnapshot,
  OrcaWriteCapabilities,
  ParameterSnapshot,
  PresetDiff,
  PresetVersionView,
  QueueChangeProposalRequest,
  RecordPrintRequest,
  RestorePresetVersionRequest,
  RollbackGuardView,
  RollbackGuardResult,
  SavePresetVersionRequest,
  UpdatePrintHistoryRequest,
  UpdateSettingsRequest,
} from './contracts'

export const HELPER_HTTP_PROTOCOL_VERSION = 1
export const HELPER_HTTP_MAX_BODY_BYTES = 2 * 1024 * 1024
export const HELPER_HTTP_NATIVE_BRIDGE_HEADER = 'x-orca-native-bridge'
export const HELPER_HTTP_NATIVE_BRIDGE_VALUE = '1'
export const HELPER_HTTP_SESSION_FRAGMENT = 'session'
export const HELPER_HTTP_STATE_FILE = 'helper-http.json'

export const HELPER_HTTP_ROUTES = {
  snapshot: '/api/v1/snapshot',
  refresh: '/api/v1/refresh',
  chooseRoot: '/api/v1/root/choose',
  updateSettings: '/api/v1/settings/update',
  setCodexScope: '/api/v1/codex/scope',
  chooseCodexFileGrant: '/api/v1/codex/file-grants/choose',
  revokeCodexFileGrant: '/api/v1/codex/file-grants/revoke',
  chooseProject3mf: '/api/v1/project-3mf/choose',
  recordPrint: '/api/v1/print-history/manual',
  updatePrintHistory: '/api/v1/print-history/update',
  openPrintHistoryRecord: '/api/v1/print-history/open',
  deletePrintHistory: '/api/v1/print-history/delete',
  listChangeProposals: '/api/v1/change-proposals/list',
  queueChangeProposal: '/api/v1/change-proposals/queue',
  approveChangeProposal: '/api/v1/change-proposals/approve',
  rejectChangeProposal: '/api/v1/change-proposals/reject',
  guardProposalRollback: '/api/v1/change-proposals/rollback-guard',
  getPresetDiff: '/api/v1/preset-diff',
  initializePresetGit: '/api/v1/preset-versions/initialize',
  savePresetVersion: '/api/v1/preset-versions/save',
  listPresetVersions: '/api/v1/preset-versions/list',
  restorePresetVersion: '/api/v1/preset-versions/restore',
  openRoot: '/api/v1/root/open',
  launchOrca: '/api/v1/orca/launch',
  publishNativeState: '/internal/v1/native-state/publish',
  prepareProjectExport: '/internal/v1/print-history/prepare-project-export',
  completeChangeProposal: '/internal/v1/change-proposals/complete',
  recordOrcaPrint: '/internal/v1/print-history/orca',
} as const

export type HelperHttpRoute = (typeof HELPER_HTTP_ROUTES)[keyof typeof HELPER_HTTP_ROUTES]

export interface AuthoritativeChangeReceipt {
  readonly authority: 'orca'
  readonly status: 'applied' | 'rejected' | 'failed' | 'rolled-back'
  readonly revision: string
  readonly before: ParameterSnapshot
  readonly after: ParameterSnapshot
  readonly rollbackGuard?: RollbackGuardView
  readonly error?: string
}

export interface CompleteChangeProposalRequest {
  readonly id: string
  readonly receipt: AuthoritativeChangeReceipt
}

export interface OrcaPrintArchiveRequest {
  readonly archiveId: string
  readonly project3mfPath?: string
  readonly effectiveSettings: OrcaEffectiveSettingsSnapshot
}

export type HelperJsonValue =
  | string
  | number
  | boolean
  | null
  | readonly HelperJsonValue[]
  | { readonly [key: string]: HelperJsonValue }

export interface PublishNativeStateRequest {
  readonly revision: number
  readonly selections: OrcaEffectiveSettingsSnapshot['selections']
  readonly writeCapabilities: OrcaWriteCapabilities
  readonly settings?: ParameterSnapshot
  readonly project?: Readonly<Record<string, HelperJsonValue>>
}

export interface PublishedNativeState {
  readonly schemaVersion: 1
  readonly source: 'orca-native'
  readonly generatedAt: string
  readonly revision: string
  readonly selections: OrcaEffectiveSettingsSnapshot['selections']
  readonly writeCapabilities: OrcaWriteCapabilities
  readonly settings?: ParameterSnapshot
  readonly project?: Readonly<Record<string, HelperJsonValue>>
}

export interface PrepareProjectExportResult {
  readonly status: 'ready' | 'skipped'
  readonly destinationPath: string | null
  readonly reason: 'auto-archive-disabled' | 'policy-never' | 'explicit-selection-required' | null
}

export interface HelperHttpRequestMap {
  readonly snapshot: Record<string, never>
  readonly refresh: Record<string, never>
  readonly chooseRoot: { readonly language: Language }
  readonly updateSettings: UpdateSettingsRequest
  readonly setCodexScope: { readonly scope: CodexPermissionScope }
  readonly chooseCodexFileGrant: { readonly language: Language }
  readonly revokeCodexFileGrant: { readonly path: string }
  readonly chooseProject3mf: { readonly language: Language }
  readonly recordPrint: RecordPrintRequest
  readonly updatePrintHistory: UpdatePrintHistoryRequest
  readonly openPrintHistoryRecord: { readonly id: string }
  readonly deletePrintHistory: { readonly id: string }
  readonly listChangeProposals: Record<string, never>
  readonly queueChangeProposal: QueueChangeProposalRequest
  readonly approveChangeProposal: ApproveChangeProposalRequest
  readonly rejectChangeProposal: { readonly id: string }
  readonly guardProposalRollback: GuardProposalRollbackRequest
  readonly getPresetDiff: { readonly presetId: string }
  readonly initializePresetGit: Record<string, never>
  readonly savePresetVersion: SavePresetVersionRequest
  readonly listPresetVersions: Record<string, never>
  readonly restorePresetVersion: RestorePresetVersionRequest
  readonly openRoot: Record<string, never>
  readonly launchOrca: Record<string, never>
  readonly publishNativeState: PublishNativeStateRequest
  readonly prepareProjectExport: {
    readonly archiveId: string
    readonly explicitConsent?: boolean
  }
  readonly completeChangeProposal: CompleteChangeProposalRequest
  readonly recordOrcaPrint: OrcaPrintArchiveRequest
}

export interface HelperHttpResponseMap {
  readonly snapshot: DashboardSnapshot
  readonly refresh: DashboardSnapshot
  readonly chooseRoot: DashboardSnapshot | null
  readonly updateSettings: DashboardSnapshot
  readonly setCodexScope: DashboardSnapshot
  readonly chooseCodexFileGrant: DashboardSnapshot | null
  readonly revokeCodexFileGrant: DashboardSnapshot
  readonly chooseProject3mf: string | null
  readonly recordPrint: DashboardSnapshot
  readonly updatePrintHistory: DashboardSnapshot
  readonly openPrintHistoryRecord: null
  readonly deletePrintHistory: DashboardSnapshot
  readonly listChangeProposals: readonly ChangeProposalView[]
  readonly queueChangeProposal: ChangeProposalView
  readonly approveChangeProposal: ChangeProposalView
  readonly rejectChangeProposal: ChangeProposalView
  readonly guardProposalRollback: RollbackGuardResult
  readonly getPresetDiff: PresetDiff
  readonly initializePresetGit: DashboardSnapshot
  readonly savePresetVersion: DashboardSnapshot
  readonly listPresetVersions: readonly PresetVersionView[]
  readonly restorePresetVersion: DashboardSnapshot
  readonly openRoot: null
  readonly launchOrca: null
  readonly publishNativeState: PublishedNativeState
  readonly prepareProjectExport: PrepareProjectExportResult
  readonly completeChangeProposal: ChangeProposalView
  readonly recordOrcaPrint: DashboardSnapshot
}

export interface HelperHttpSuccess<T> {
  readonly ok: true
  readonly data: T
}

export interface HelperHttpFailure {
  readonly ok: false
  readonly error: {
    readonly code: string
  }
}

export type HelperHttpResponse<T> = HelperHttpSuccess<T> | HelperHttpFailure

export interface HelperHttpState {
  readonly schemaVersion: 1
  readonly pid: number
  readonly generatedAt: string
  readonly origin: string
  readonly port: number
}
