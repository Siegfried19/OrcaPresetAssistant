export const IPC_CHANNELS = {
  getSnapshot: 'dashboard:get-snapshot',
  refresh: 'dashboard:refresh',
  chooseRoot: 'dashboard:choose-root',
  updateSettings: 'dashboard:update-settings',
  setCodexScope: 'dashboard:set-codex-scope',
  chooseCodexFileGrant: 'dashboard:choose-codex-file-grant',
  revokeCodexFileGrant: 'dashboard:revoke-codex-file-grant',
  chooseProject3mf: 'dashboard:choose-project-3mf',
  recordPrint: 'dashboard:record-print',
  updatePrintHistory: 'dashboard:update-print-history',
  openPrintHistoryRecord: 'dashboard:open-print-history-record',
  deletePrintHistory: 'dashboard:delete-print-history',
  listChangeProposals: 'dashboard:list-change-proposals',
  queueChangeProposal: 'dashboard:queue-change-proposal',
  approveChangeProposal: 'dashboard:approve-change-proposal',
  rejectChangeProposal: 'dashboard:reject-change-proposal',
  guardProposalRollback: 'dashboard:guard-proposal-rollback',
  getPresetDiff: 'dashboard:get-preset-diff',
  initializePresetGit: 'dashboard:initialize-preset-git',
  savePresetVersion: 'dashboard:save-preset-version',
  listPresetVersions: 'dashboard:list-preset-versions',
  restorePresetVersion: 'dashboard:restore-preset-version',
  openRoot: 'dashboard:open-root',
  launchOrca: 'dashboard:launch-orca',
  snapshotChanged: 'dashboard:snapshot-changed',
} as const

export type PresetKind = 'process' | 'filament' | 'machine'
export type PresetOrigin = 'orca-managed' | 'local-json'
export type GitState = 'new' | 'modified' | 'metadata' | 'clean' | 'unknown'
export type PrintResult = 'pending' | 'success' | 'issue' | 'failed'
export const MATERIAL_ROLES = ['model', 'support-base', 'support-interface', 'other'] as const
export type MaterialRole = (typeof MATERIAL_ROLES)[number]
export type RecordedMaterialRole = MaterialRole | 'unspecified'
export type RootSource = 'automatic' | 'saved' | 'manual'
export type Language = 'zh-CN' | 'en'
export type ThreeMfPolicy = 'always' | 'ask' | 'never'
export type CodexPermissionScope = 'general' | 'current-settings' | 'current-project'
export type ChangeDestination = 'current-project' | 'update-current-preset' | 'save-as-new-preset'
export type ChangeProposalStatus =
  | 'pending'
  | 'applied'
  | 'rejected'
  | 'failed'
  | 'partially-rolled-back'
  | 'changed-after-apply'
  | 'rolled-back'
export type PresetFileOperation = 'create' | 'update'
export type PresetFileChangeStatus = 'planned' | 'written' | 'loaded' | 'conflict'
export type ParameterValue = string | number | boolean | readonly ParameterValue[] | null
export type ParameterSnapshot = Readonly<Record<string, ParameterValue>>
export type ParameterValueShape = 'scalar' | 'scalar-or-vector'
export type ParameterScalarKind = 'boolean' | 'integer' | 'number' | 'percent'
export type ParameterPanelVisibility = 'visible' | 'hidden'
export type ParameterEditorMode = 'simple' | 'advanced' | 'expert' | 'developer'
export type PrintCaptureQuality = 'orca-effective' | 'custom-presets-only'
export type ValidationIssue =
  | 'json-root-not-object'
  | 'json-parse-failed'
  | 'missing-internal-name'
  | 'filename-name-mismatch'
  | 'missing-settings-id'
  | 'settings-id-filename-mismatch'
export type DashboardWarning =
  | 'git-unavailable'
  | 'orca-unavailable'
  | 'workspace-not-found'
  | 'workspace-mismatch'
  | 'orca-restart-required'
  | 'project-archive-failed'
export type AppErrorCode =
  | 'untrusted-window'
  | 'invalid-preset-id'
  | 'invalid-workspace-root'
  | 'workspace-not-connected'
  | 'preset-not-found'
  | 'orca-not-found'
  | 'invalid-print-result'
  | 'note-too-long'
  | 'filament-required'
  | 'duplicate-filament'
  | 'invalid-material-role'
  | 'invalid-process'
  | 'filament-not-found'
  | 'invalid-project-3mf'
  | 'project-3mf-not-granted'
  | 'print-history-not-found'
  | 'invalid-file-grant'
  | 'invalid-permission-scope'
  | 'invalid-change-proposal'
  | 'change-proposal-not-found'
  | 'invalid-authoritative-receipt'
  | 'workspace-mismatch'
  | 'orca-restart-required'
  | 'git-unavailable'
  | 'git-operation-failed'
  | 'git-nothing-to-save'
  | 'git-working-tree-dirty'
  | 'git-history-not-found'
  | 'invalid-version-message'

export interface DiffStats {
  readonly added: number
  readonly deleted: number
}

export interface LatestPrintView {
  readonly eventId: string
  readonly printedAt: string
  readonly result: PrintResult
  readonly note: string
  readonly currentVersion: boolean
  readonly materials: readonly LatestPrintMaterialView[]
}

export interface LatestPrintMaterialView {
  readonly name: string
  readonly role: RecordedMaterialRole
}

export interface PresetView {
  readonly id: string
  readonly kind: PresetKind
  readonly origin: PresetOrigin
  readonly name: string
  readonly inherits: string
  readonly settingsId: string
  readonly relativePath: string
  readonly modifiedAt: string
  readonly gitState: GitState
  readonly diffStats: DiffStats | null
  readonly validationIssues: readonly ValidationIssue[]
  readonly latestPrint: LatestPrintView | null
  readonly isSystem: boolean
}

export interface DashboardStats {
  readonly total: number
  readonly process: number
  readonly filament: number
  readonly machine: number
  readonly changed: number
  readonly needsAttention: number
}

export interface RootView {
  readonly path: string
  readonly userPresetsPath: string
  readonly printHistoryPath: string
  readonly source: RootSource
  readonly isGitRepository: boolean
  readonly latestPresetVersion: PresetVersionView | null
  readonly orcaExecutable: string | null
}

export interface PresetVersionView {
  readonly revision: string
  readonly shortRevision: string
  readonly createdAt: string
  readonly message: string
}

export interface SavePresetVersionRequest {
  readonly message: string
}

export interface RestorePresetVersionRequest {
  readonly revision: string
}

export interface PrintHistoryPresetView {
  readonly presetId: string | null
  readonly name: string
}

export interface PrintHistoryMaterialView extends PrintHistoryPresetView {
  readonly role: RecordedMaterialRole
}

export interface PrintHistoryView {
  readonly id: string
  readonly createdAt: string
  readonly result: PrintResult
  readonly note: string
  readonly relativePath: string
  readonly source: 'manual' | 'orca-submission'
  readonly captureQuality: PrintCaptureQuality
  readonly machine: PrintHistoryPresetView | null
  readonly process: PrintHistoryPresetView
  readonly materials: readonly PrintHistoryMaterialView[]
  readonly hasProject3mf: boolean
  readonly effectiveSettings: ParameterSnapshot | null
}

export interface OrcaPresetIdentity {
  readonly name: string
  readonly isSystem: boolean
  readonly isUser: boolean
  readonly isDefault: boolean
  readonly isExternal: boolean
  readonly isProjectEmbedded: boolean
  readonly isDirty: boolean
  readonly canOverwrite: boolean
}

export interface OrcaPresetSelections {
  readonly machine: OrcaPresetIdentity
  readonly process: OrcaPresetIdentity
  readonly filaments: readonly OrcaPresetIdentity[]
}

export interface OrcaEffectiveSettingsSnapshot {
  readonly authority: 'orca'
  readonly revision: number
  readonly effective: ParameterSnapshot
  readonly selections: OrcaPresetSelections
}

export interface OrcaWriteSettingCapability {
  readonly key: string
  readonly valueShape: ParameterValueShape
  readonly kind: ParameterScalarKind
  readonly minimum: number
  readonly maximum: number | null
  readonly dynamicMaximum?: string
  readonly unit: string
  readonly scalarBehavior?: 'broadcast-to-current-value-count'
  readonly displayLabel: string
  readonly category: string
  readonly editorMode: ParameterEditorMode
  readonly panelVisibility: ParameterPanelVisibility
  readonly verification: 'orca-readback'
}

export interface OrcaPresetWriteCapability {
  readonly access: 'controlled-write' | 'read-only'
  readonly settings: readonly OrcaWriteSettingCapability[]
}

export interface OrcaWriteCapabilities {
  readonly process: OrcaPresetWriteCapability
  readonly filament: OrcaPresetWriteCapability
  readonly machine: OrcaPresetWriteCapability
}

export interface CodexPermissionsView {
  readonly scope: CodexPermissionScope
  readonly fileGrants: readonly string[]
}

export interface AppSettingsView {
  readonly language: Language
  readonly autoArchive: boolean
  readonly threeMfPolicy: ThreeMfPolicy
  readonly codexPermissions: CodexPermissionsView
}

export interface UpdateSettingsRequest {
  readonly language?: Language
  readonly autoArchive?: boolean
  readonly threeMfPolicy?: ThreeMfPolicy
}

export interface ChangeProposalView {
  readonly id: string
  readonly createdAt: string
  readonly updatedAt: string
  readonly approvedAt: string | null
  readonly destination: ChangeDestination
  readonly presetKind: PresetKind
  readonly presetId: string
  readonly newPresetName: string | null
  readonly before: ParameterSnapshot
  readonly after: ParameterSnapshot
  readonly currentValues?: ParameterSnapshot | null
  readonly reason: string
  readonly status: ChangeProposalStatus
  readonly requestedRevision: string
  readonly authoritativeRevision: string | null
  readonly rollbackGuard: RollbackGuardView | null
  readonly error: string | null
}

export interface PresetFileChangeView {
  readonly id: string
  readonly createdAt: string
  readonly updatedAt: string
  readonly operation: PresetFileOperation
  readonly presetKind: 'process' | 'filament'
  readonly presetName: string
  readonly relativePath: string
  readonly sourceRelativePath: string | null
  readonly before: ParameterSnapshot
  readonly after: ParameterSnapshot
  readonly removedKeys: readonly string[]
  readonly reason: string
  readonly status: PresetFileChangeStatus
  readonly beforeFileHash: string | null
  readonly writtenFileHash: string | null
  readonly authoritativeRevision: string | null
  readonly error: string | null
}

export interface RollbackGuardView {
  readonly id: string
  readonly validAtRevision: string
}

export interface DashboardSnapshot {
  readonly generatedAt: string
  readonly root: RootView
  readonly stats: DashboardStats
  readonly presets: readonly PresetView[]
  readonly printHistory: readonly PrintHistoryView[]
  readonly settings: AppSettingsView
  readonly writeCapabilities: OrcaWriteCapabilities | null
  readonly changeProposals: readonly ChangeProposalView[]
  readonly presetFileChanges: readonly PresetFileChangeView[]
  readonly warnings: readonly DashboardWarning[]
}

export interface RecordPrintRequest {
  readonly processId: string
  readonly materials: readonly MaterialAssignment[]
  readonly result: PrintResult
  readonly note: string
  readonly project3mfPath?: string
}

export interface UpdatePrintHistoryRequest {
  readonly id: string
  readonly result: PrintResult
  readonly note: string
}

export interface QueueChangeProposalRequest {
  readonly destination: ChangeDestination
  readonly presetKind: PresetKind
  readonly presetId: string
  readonly newPresetName?: string
  readonly before: ParameterSnapshot
  readonly after: ParameterSnapshot
  readonly reason: string
  readonly requestedRevision: string
}

export interface ApproveChangeProposalRequest {
  readonly id: string
  readonly destination: ChangeDestination
  readonly newPresetName?: string
}

export interface GuardProposalRollbackRequest {
  readonly id: string
  readonly currentRevision: string
  readonly currentValues: ParameterSnapshot
}

export type RollbackGuardReason = 'not-applied' | 'revision-mismatch' | 'values-changed'

export interface RollbackGuardResult {
  readonly allowed: boolean
  readonly reason: RollbackGuardReason | null
  readonly changes: ParameterSnapshot | null
}

export interface MaterialAssignment {
  readonly presetId: string
  readonly role: MaterialRole
}

export interface PresetDiff {
  readonly title: string
  readonly content: string
  readonly state: 'clean' | 'unknown' | 'new' | 'modified-empty' | 'modified'
}

export interface DashboardApi {
  getSnapshot(): Promise<DashboardSnapshot>
  refresh(): Promise<DashboardSnapshot>
  chooseRoot(language: Language): Promise<DashboardSnapshot | null>
  updateSettings(request: UpdateSettingsRequest): Promise<DashboardSnapshot>
  setCodexScope(scope: CodexPermissionScope): Promise<DashboardSnapshot>
  chooseCodexFileGrant(language: Language): Promise<DashboardSnapshot | null>
  revokeCodexFileGrant(path: string): Promise<DashboardSnapshot>
  chooseProject3mf(language: Language): Promise<string | null>
  recordPrint(request: RecordPrintRequest): Promise<DashboardSnapshot>
  updatePrintHistory(request: UpdatePrintHistoryRequest): Promise<DashboardSnapshot>
  openPrintHistoryRecord(id: string): Promise<void>
  deletePrintHistory(id: string): Promise<DashboardSnapshot>
  listChangeProposals(): Promise<readonly ChangeProposalView[]>
  queueChangeProposal(request: QueueChangeProposalRequest): Promise<ChangeProposalView>
  approveChangeProposal(request: ApproveChangeProposalRequest): Promise<ChangeProposalView>
  rejectChangeProposal(id: string): Promise<ChangeProposalView>
  rollbackChangeProposal(id: string): Promise<ChangeProposalView>
  guardProposalRollback(request: GuardProposalRollbackRequest): Promise<RollbackGuardResult>
  getPresetDiff(presetId: string): Promise<PresetDiff>
  initializePresetGit(): Promise<DashboardSnapshot>
  savePresetVersion(request: SavePresetVersionRequest): Promise<DashboardSnapshot>
  listPresetVersions(): Promise<readonly PresetVersionView[]>
  restorePresetVersion(request: RestorePresetVersionRequest): Promise<DashboardSnapshot>
  openRoot(): Promise<void>
  launchOrca(): Promise<void>
  onSnapshotChanged(callback: (snapshot: DashboardSnapshot) => void): () => void
}
