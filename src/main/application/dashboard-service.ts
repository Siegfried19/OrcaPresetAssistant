import { shell } from 'electron'

import { MATERIAL_ROLES } from '@shared/contracts'
import type {
  AppErrorCode,
  DashboardWarning,
  DashboardSnapshot,
  MaterialRole,
  PresetDiff,
  PresetView,
  RecordPrintRequest,
  RootSource,
} from '@shared/contracts'

import type { InternalPreset, RootResolution } from '../domain/models'
import { isPrintResult } from '../domain/preset-rules'
import { findBambuExecutable, launchDetached } from '../infrastructure/bambu-service'
import { ConfigStore } from '../infrastructure/config-store'
import { discoverPresetRoot, isPresetRoot } from '../infrastructure/discovery'
import { appendPrintEvent, applyLatestPrints } from '../infrastructure/event-store'
import { applyGitState, readGitSnapshot, readPresetDiff } from '../infrastructure/git-service'
import { scanPresets } from '../infrastructure/preset-repository'

interface RefreshResult {
  readonly snapshot: DashboardSnapshot
  readonly changed: boolean
}

function appError(code: AppErrorCode): Error {
  return new Error(code)
}

function toPresetView(preset: InternalPreset): PresetView {
  return {
    id: preset.id,
    kind: preset.kind,
    name: preset.name,
    inherits: preset.inherits,
    settingsId: preset.settingsId,
    relativePath: preset.relativePath,
    modifiedAt: preset.modifiedAt,
    gitState: preset.gitState,
    diffStats: preset.diffStats,
    validationIssues: preset.validationIssues,
    latestPrint: preset.latestPrint,
  }
}

function snapshotSignature(snapshot: DashboardSnapshot): string {
  return JSON.stringify({
    root: snapshot.root,
    stats: snapshot.stats,
    warnings: snapshot.warnings,
    presets: snapshot.presets.map((preset) => ({
      id: preset.id,
      modifiedAt: preset.modifiedAt,
      gitState: preset.gitState,
      diffStats: preset.diffStats,
      validationIssues: preset.validationIssues,
      latestPrint: preset.latestPrint,
    })),
  })
}

export class DashboardService {
  private readonly appDataPath: string
  private readonly configStore: ConfigStore
  private root: RootResolution | null = null
  private presets: InternalPreset[] = []
  private snapshot: DashboardSnapshot | null = null
  private signature = ''
  private refreshInFlight: Promise<RefreshResult> | null = null

  public constructor(appDataPath: string, userDataPath: string) {
    this.appDataPath = appDataPath
    this.configStore = new ConfigStore(userDataPath)
  }

  public async initialize(): Promise<DashboardSnapshot> {
    const config = await this.configStore.read()
    this.root = await discoverPresetRoot(this.appDataPath, config.presetRoot)
    return (await this.refresh()).snapshot
  }

  public async setRoot(path: string, source: RootSource = 'manual'): Promise<DashboardSnapshot> {
    if (!(await isPresetRoot(path))) {
      throw appError('invalid-preset-root')
    }

    this.root = { path, source }
    await this.configStore.savePresetRoot(path)
    return (await this.refresh()).snapshot
  }

  public async refresh(): Promise<RefreshResult> {
    if (this.refreshInFlight) return this.refreshInFlight
    this.refreshInFlight = this.performRefresh()

    try {
      return await this.refreshInFlight
    } finally {
      this.refreshInFlight = null
    }
  }

  public async getSnapshot(): Promise<DashboardSnapshot> {
    if (!this.snapshot) return (await this.refresh()).snapshot
    return this.snapshot
  }

  public async recordPrint(request: RecordPrintRequest): Promise<DashboardSnapshot> {
    const { processPreset, materials } = this.validateRecordRequest(request)
    if (!this.root) throw appError('preset-root-not-connected')

    await appendPrintEvent(this.root.path, processPreset, materials, request.result, request.note)
    return (await this.refresh()).snapshot
  }

  public async getPresetDiff(presetId: string): Promise<PresetDiff> {
    const preset = this.presets.find((candidate) => candidate.id === presetId)
    if (!preset) throw appError('preset-not-found')
    return readPresetDiff(preset)
  }

  public async openRoot(): Promise<void> {
    if (!this.root) throw appError('preset-root-not-connected')
    const message = await shell.openPath(this.root.path)
    if (message) throw new Error(message)
  }

  public async launchBambu(): Promise<void> {
    const executable = this.snapshot?.root.bambuExecutable ?? (await findBambuExecutable())
    if (!executable) throw appError('bambu-not-found')
    launchDetached(executable)
  }

  private async performRefresh(): Promise<RefreshResult> {
    const previousSignature = this.signature
    if (!this.root) {
      const emptySnapshot = this.createEmptySnapshot()
      this.snapshot = emptySnapshot
      this.signature = snapshotSignature(emptySnapshot)
      return { snapshot: emptySnapshot, changed: this.signature !== previousSignature }
    }

    const [presets, gitSnapshot, bambuExecutable] = await Promise.all([
      scanPresets(this.root.path),
      readGitSnapshot(this.root.path),
      findBambuExecutable(),
    ])
    await Promise.all([
      applyGitState(this.root.path, presets, gitSnapshot),
      applyLatestPrints(this.root.path, presets),
    ])
    this.presets = presets

    const warnings: DashboardWarning[] = []
    if (!gitSnapshot.isRepository) {
      warnings.push('git-unavailable')
    }
    if (!bambuExecutable) {
      warnings.push('bambu-unavailable')
    }

    const views = presets.map(toPresetView)
    const snapshot: DashboardSnapshot = {
      generatedAt: new Date().toISOString(),
      root: {
        path: this.root.path,
        source: this.root.source,
        isGitRepository: gitSnapshot.isRepository,
        bambuExecutable,
      },
      stats: {
        total: views.length,
        process: views.filter((preset) => preset.kind === 'process').length,
        filament: views.filter((preset) => preset.kind === 'filament').length,
        machine: views.filter((preset) => preset.kind === 'machine').length,
        changed: views.filter((preset) => ['new', 'modified', 'metadata'].includes(preset.gitState))
          .length,
        needsAttention: views.filter((preset) => preset.validationIssues.length > 0).length,
      },
      presets: views,
      warnings,
    }

    this.snapshot = snapshot
    this.signature = snapshotSignature(snapshot)
    return { snapshot, changed: this.signature !== previousSignature }
  }

  private createEmptySnapshot(): DashboardSnapshot {
    return {
      generatedAt: new Date().toISOString(),
      root: {
        path: '',
        source: 'automatic',
        isGitRepository: false,
        bambuExecutable: null,
      },
      stats: {
        total: 0,
        process: 0,
        filament: 0,
        machine: 0,
        changed: 0,
        needsAttention: 0,
      },
      presets: [],
      warnings: ['preset-root-not-found'],
    }
  }

  private validateRecordRequest(request: RecordPrintRequest): {
    processPreset: InternalPreset
    materials: {
      readonly preset: InternalPreset
      readonly role: MaterialRole
    }[]
  } {
    if (!isPrintResult(request.result)) {
      throw appError('invalid-print-result')
    }
    if (typeof request.note !== 'string' || request.note.length > 2_000) {
      throw appError('note-too-long')
    }
    if (!Array.isArray(request.materials) || request.materials.length === 0) {
      throw appError('filament-required')
    }
    if (
      !request.materials.every(
        (material) =>
          typeof material === 'object' &&
          material !== null &&
          typeof material.presetId === 'string' &&
          MATERIAL_ROLES.some((role) => role === material.role),
      )
    ) {
      throw appError('invalid-material-role')
    }
    const materialIds = request.materials.map((material) => material.presetId)
    if (new Set(materialIds).size !== materialIds.length) {
      throw appError('duplicate-filament')
    }

    const processPreset = this.presets.find((preset) => preset.id === request.processId)
    if (!processPreset || processPreset.kind !== 'process') {
      throw appError('invalid-process')
    }

    const materials = request.materials.map((material) => {
      const preset = this.presets.find((candidate) => candidate.id === material.presetId)
      if (!preset || preset.kind !== 'filament') {
        throw appError('filament-not-found')
      }
      return { preset, role: material.role }
    })

    return { processPreset, materials }
  }
}
