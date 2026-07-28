export const IPC_CHANNELS = {
  getSnapshot: 'dashboard:get-snapshot',
  refresh: 'dashboard:refresh',
  chooseRoot: 'dashboard:choose-root',
  recordPrint: 'dashboard:record-print',
  getPresetDiff: 'dashboard:get-preset-diff',
  openRoot: 'dashboard:open-root',
  launchBambu: 'dashboard:launch-bambu',
  snapshotChanged: 'dashboard:snapshot-changed',
} as const

export type PresetKind = 'process' | 'filament' | 'machine'
export type GitState = 'new' | 'modified' | 'metadata' | 'clean' | 'unknown'
export type PrintResult = 'success' | 'issue' | 'failed'
export const MATERIAL_ROLES = ['model', 'support-base', 'support-interface', 'other'] as const
export type MaterialRole = (typeof MATERIAL_ROLES)[number]
export type RecordedMaterialRole = MaterialRole | 'unspecified'
export type RootSource = 'automatic' | 'saved' | 'manual'
export type Language = 'zh-CN' | 'en'
export type ValidationIssue =
  | 'json-root-not-object'
  | 'json-parse-failed'
  | 'missing-internal-name'
  | 'filename-name-mismatch'
  | 'missing-settings-id'
  | 'settings-id-filename-mismatch'
  | 'missing-info'
export type DashboardWarning = 'git-unavailable' | 'bambu-unavailable' | 'preset-root-not-found'
export type AppErrorCode =
  | 'untrusted-window'
  | 'invalid-preset-id'
  | 'invalid-preset-root'
  | 'preset-root-not-connected'
  | 'preset-not-found'
  | 'bambu-not-found'
  | 'invalid-print-result'
  | 'note-too-long'
  | 'filament-required'
  | 'duplicate-filament'
  | 'invalid-material-role'
  | 'invalid-process'
  | 'filament-not-found'

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
  readonly name: string
  readonly inherits: string
  readonly settingsId: string
  readonly relativePath: string
  readonly modifiedAt: string
  readonly gitState: GitState
  readonly diffStats: DiffStats | null
  readonly validationIssues: readonly ValidationIssue[]
  readonly latestPrint: LatestPrintView | null
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
  readonly source: RootSource
  readonly isGitRepository: boolean
  readonly bambuExecutable: string | null
}

export interface DashboardSnapshot {
  readonly generatedAt: string
  readonly root: RootView
  readonly stats: DashboardStats
  readonly presets: readonly PresetView[]
  readonly warnings: readonly DashboardWarning[]
}

export interface RecordPrintRequest {
  readonly processId: string
  readonly materials: readonly MaterialAssignment[]
  readonly result: PrintResult
  readonly note: string
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
  recordPrint(request: RecordPrintRequest): Promise<DashboardSnapshot>
  getPresetDiff(presetId: string): Promise<PresetDiff>
  openRoot(): Promise<void>
  launchBambu(): Promise<void>
  onSnapshotChanged(callback: (snapshot: DashboardSnapshot) => void): () => void
}
