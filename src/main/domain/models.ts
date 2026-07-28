import type {
  DiffStats,
  GitState,
  LatestPrintView,
  PresetKind,
  RootSource,
  ValidationIssue,
} from '@shared/contracts'

export type JsonRecord = Record<string, unknown>

export interface InternalPreset {
  readonly id: string
  readonly rootPath: string
  readonly filePath: string
  readonly infoPath: string | null
  readonly relativePath: string
  readonly relativeInfoPath: string | null
  readonly kind: PresetKind
  readonly name: string
  readonly inherits: string
  readonly settingsId: string
  readonly modifiedAt: string
  readonly data: JsonRecord
  readonly validationIssues: readonly ValidationIssue[]
  gitState: GitState
  diffStats: DiffStats | null
  latestPrint: LatestPrintView | null
}

export interface RootResolution {
  readonly path: string
  readonly source: RootSource
}

export interface AppConfig {
  readonly schemaVersion: 1
  readonly presetRoot?: string
}

export interface PrintSnapshot {
  readonly path: string
  readonly sha256: string
  readonly custom_json: JsonRecord
}

export interface PrintEvent {
  readonly schema_version: 1
  readonly type: 'print'
  readonly id: string
  readonly printed_at: string
  readonly actor: 'user'
  readonly result: 'success' | 'issue' | 'failed'
  readonly note: string
  readonly process: PrintSnapshot
  readonly filaments: readonly PrintSnapshot[]
}
