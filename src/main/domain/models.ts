import type {
  DiffStats,
  CodexPermissionScope,
  GitState,
  Language,
  LatestPrintView,
  OrcaEffectiveSettingsSnapshot,
  PresetKind,
  PrintCaptureQuality,
  RecordedMaterialRole,
  PrintResult,
  RootSource,
  ThreeMfPolicy,
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
  readonly isSystem: boolean
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
  readonly workspaceRoot?: string
  readonly language: Language
  readonly autoArchive: boolean
  readonly threeMfPolicy: ThreeMfPolicy
  readonly codexPermissions: {
    readonly scope: CodexPermissionScope
    readonly fileGrants: readonly string[]
  }
}

export interface PrintSnapshot {
  readonly presetId: string
  readonly kind: PresetKind
  readonly name: string
  readonly path: string
  readonly sha256: string
  readonly customJson: JsonRecord
}

export interface PrintHistoryRecord {
  readonly schemaVersion: 1
  readonly id: string
  readonly createdAt: string
  readonly source: 'manual' | 'orca-submission'
  readonly captureQuality: PrintCaptureQuality
  readonly result: PrintResult
  readonly note: string
  readonly updatedAt: string
  readonly nativeArchiveId: string | null
  readonly processPresetId: string | null
  readonly materials: readonly {
    readonly presetId: string | null
    readonly role: RecordedMaterialRole
  }[]
}

export interface PrintHistoryMaterialSnapshot {
  readonly role: RecordedMaterialRole
  readonly preset: PrintSnapshot
}

export interface PrintHistorySettings {
  readonly schemaVersion: 1
  readonly capturedAt: string
  readonly captureQuality: PrintCaptureQuality
  readonly effectiveSettings: OrcaEffectiveSettingsSnapshot | null
  readonly process: PrintSnapshot | null
  readonly materials: readonly PrintHistoryMaterialSnapshot[]
}
