import { lstat } from 'node:fs/promises'
import { extname, isAbsolute, resolve } from 'node:path'

import { shell } from 'electron'

import { MATERIAL_ROLES } from '@shared/contracts'
import type {
  AppErrorCode,
  ApproveChangeProposalRequest,
  ChangeProposalView,
  CodexPermissionScope,
  DashboardWarning,
  DashboardSnapshot,
  GuardProposalRollbackRequest,
  MaterialRole,
  PresetDiff,
  PresetVersionView,
  PresetView,
  QueueChangeProposalRequest,
  RecordPrintRequest,
  RestorePresetVersionRequest,
  RollbackGuardResult,
  RootSource,
  SavePresetVersionRequest,
  UpdatePrintHistoryRequest,
  UpdateSettingsRequest,
} from '@shared/contracts'
import type {
  CompleteChangeProposalRequest,
  CompletePresetFileChangeRequest,
  OrcaPrintArchiveRequest,
  PrepareProjectExportResult,
  PublishNativeStateRequest,
  PublishedNativeState,
} from '@shared/helper-http'
import { parameterSnapshotsEqual } from '@shared/parameter-comparison'

import type { AppConfig, InternalPreset, RootResolution } from '../domain/models'
import { isPrintResult } from '../domain/preset-rules'
import { ChangeProposalStore } from '../infrastructure/change-proposal-store'
import { CodexSessionStore } from '../infrastructure/codex-session-store'
import { ConfigStore, DEFAULT_APP_CONFIG } from '../infrastructure/config-store'
import {
  discoverWorkspaceRoot,
  ensureWorkspaceRoot,
  workspacePaths,
} from '../infrastructure/discovery'
import {
  applyGitState,
  initializePresetRepository,
  readGitSnapshot,
  readPresetDiff,
  readPresetVersions,
  restorePresetVersion,
  savePresetVersion,
} from '../infrastructure/git-service'
import { findOrcaExecutable, launchDetached } from '../infrastructure/orca-service'
import { NativeStateStore } from '../infrastructure/native-state-store'
import { PresetFileChangeStore } from '../infrastructure/preset-file-change-store'
import { scanPresets } from '../infrastructure/preset-repository'
import {
  applyLatestPrints,
  createOrcaPrintHistoryBundle,
  createPrintHistoryBundle,
  listPrintHistory,
  prepareProject3mfExport,
  resolvePrintHistoryBundlePath,
  updatePrintHistoryRecord,
  validateProject3mf,
} from '../infrastructure/print-history-store'

interface RefreshResult {
  readonly snapshot: DashboardSnapshot
  readonly changed: boolean
}

const PROPOSAL_RECONCILIATION_GRACE_MS = 10_000

function appError(code: AppErrorCode): Error {
  return new Error(code)
}

function toPresetView(preset: InternalPreset): PresetView {
  return {
    id: preset.id,
    kind: preset.kind,
    origin: preset.infoPath ? 'orca-managed' : 'local-json',
    name: preset.name,
    inherits: preset.inherits,
    settingsId: preset.settingsId,
    relativePath: preset.relativePath,
    modifiedAt: preset.modifiedAt,
    gitState: preset.gitState,
    diffStats: preset.diffStats,
    validationIssues: preset.validationIssues,
    latestPrint: preset.latestPrint,
    isSystem: preset.isSystem,
  }
}

function snapshotSignature(snapshot: DashboardSnapshot): string {
  return JSON.stringify({
    root: snapshot.root,
    stats: snapshot.stats,
    warnings: snapshot.warnings,
    settings: snapshot.settings,
    changeProposals: snapshot.changeProposals,
    presetFileChanges: snapshot.presetFileChanges,
    printHistory: snapshot.printHistory,
    presets: snapshot.presets.map((preset) => ({
      id: preset.id,
      origin: preset.origin,
      modifiedAt: preset.modifiedAt,
      gitState: preset.gitState,
      diffStats: preset.diffStats,
      validationIssues: preset.validationIssues,
      latestPrint: preset.latestPrint,
    })),
  })
}

export class DashboardService {
  private readonly configStore: ConfigStore
  private readonly proposalStore: ChangeProposalStore
  private readonly presetFileChangeStore: PresetFileChangeStore
  private readonly codexSessionStore: CodexSessionStore
  private readonly nativeStateStore: NativeStateStore
  private config: AppConfig = DEFAULT_APP_CONFIG
  private root: RootResolution | null = null
  private presets: InternalPreset[] = []
  private snapshot: DashboardSnapshot | null = null
  private signature = ''
  private refreshInFlight: Promise<RefreshResult> | null = null
  private readonly project3mfGrants = new Set<string>()
  private sessionCodexScope: CodexPermissionScope | null = null

  public constructor(userDataPath: string) {
    this.configStore = new ConfigStore(userDataPath)
    this.proposalStore = new ChangeProposalStore(userDataPath)
    this.presetFileChangeStore = new PresetFileChangeStore(userDataPath)
    this.codexSessionStore = new CodexSessionStore(userDataPath)
    this.nativeStateStore = new NativeStateStore(userDataPath)
  }

  public async initialize(): Promise<DashboardSnapshot> {
    this.config = await this.configStore.read()
    const validGrants = (
      await Promise.all(
        this.config.codexPermissions.fileGrants.map((path) =>
          validateCodexFile(path).catch(() => null),
        ),
      )
    ).filter((path): path is string => path !== null)
    if (validGrants.length !== this.config.codexPermissions.fileGrants.length) {
      this.config = await this.configStore.saveCodexPermissions(
        this.config.codexPermissions.scope,
        validGrants,
      )
    }
    this.root = await discoverWorkspaceRoot(this.config.workspaceRoot)
    return (await this.refresh()).snapshot
  }

  public async setRoot(path: string, source: RootSource = 'manual'): Promise<DashboardSnapshot> {
    let workspace
    try {
      workspace = await ensureWorkspaceRoot(path)
    } catch {
      throw appError('invalid-workspace-root')
    }

    this.root = { path: workspace.root, source }
    this.config = await this.configStore.saveWorkspaceRoot(workspace.root)
    return (await this.refresh()).snapshot
  }

  public async updateSettings(request: UpdateSettingsRequest): Promise<DashboardSnapshot> {
    if (
      typeof request !== 'object' ||
      request === null ||
      (request.language !== undefined &&
        request.language !== 'zh-CN' &&
        request.language !== 'en') ||
      (request.autoArchive !== undefined && typeof request.autoArchive !== 'boolean') ||
      (request.threeMfPolicy !== undefined &&
        request.threeMfPolicy !== 'always' &&
        request.threeMfPolicy !== 'ask' &&
        request.threeMfPolicy !== 'never')
    ) {
      throw appError('invalid-change-proposal')
    }
    this.config = await this.configStore.saveSettings(request)
    return (await this.refresh()).snapshot
  }

  public async setCodexScope(scope: CodexPermissionScope): Promise<DashboardSnapshot> {
    if (scope !== 'general' && scope !== 'current-settings' && scope !== 'current-project') {
      throw appError('invalid-permission-scope')
    }
    if (scope === 'current-project') {
      this.sessionCodexScope = scope
      return (await this.refresh()).snapshot
    }
    this.sessionCodexScope = null
    this.config = await this.configStore.saveCodexPermissions(
      scope,
      this.config.codexPermissions.fileGrants,
    )
    return (await this.refresh()).snapshot
  }

  public async grantCodexFile(path: string): Promise<DashboardSnapshot> {
    const normalized = await validateCodexFile(path)
    const grants = [...new Set([...this.config.codexPermissions.fileGrants, normalized])]
    this.config = await this.configStore.saveCodexPermissions(
      this.config.codexPermissions.scope,
      grants,
    )
    return (await this.refresh()).snapshot
  }

  public async revokeCodexFile(path: string): Promise<DashboardSnapshot> {
    if (typeof path !== 'string') throw appError('invalid-file-grant')
    const normalized = resolve(path)
    const grants = this.config.codexPermissions.fileGrants.filter(
      (candidate) => resolve(candidate) !== normalized,
    )
    this.config = await this.configStore.saveCodexPermissions(
      this.config.codexPermissions.scope,
      grants,
    )
    return (await this.refresh()).snapshot
  }

  public async grantProject3mf(path: string): Promise<string> {
    const normalized = await validateProject3mf(path).catch(() => {
      throw appError('invalid-project-3mf')
    })
    this.project3mfGrants.add(normalized)
    return normalized
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
    if (!this.root) throw appError('workspace-not-connected')
    let project3mfPath: string | undefined
    if (request.project3mfPath !== undefined) {
      if (this.config.threeMfPolicy === 'never') {
        throw appError('invalid-project-3mf')
      }
      project3mfPath = await validateProject3mf(request.project3mfPath).catch(() => {
        throw appError('invalid-project-3mf')
      })
      if (!this.project3mfGrants.delete(project3mfPath)) {
        throw appError('project-3mf-not-granted')
      }
    }

    await createPrintHistoryBundle(
      this.root.path,
      processPreset,
      materials,
      request.result,
      request.note,
      project3mfPath,
    )
    return (await this.refresh()).snapshot
  }

  // Authenticated native/Orca integration entry. This is intentionally not exposed through preload.
  public async recordOrcaPrint(request: OrcaPrintArchiveRequest): Promise<DashboardSnapshot> {
    if (!this.root) throw appError('workspace-not-connected')
    if (!this.config.autoArchive) return (await this.refresh()).snapshot
    let project3mfPath: string | undefined
    if (request.project3mfPath !== undefined) {
      if (this.config.threeMfPolicy === 'never') {
        throw appError('invalid-project-3mf')
      }
      project3mfPath = await validateProject3mf(request.project3mfPath).catch(() => {
        throw appError('invalid-project-3mf')
      })
      if (this.config.threeMfPolicy === 'ask' && !this.project3mfGrants.delete(project3mfPath)) {
        throw appError('project-3mf-not-granted')
      }
    }
    await createOrcaPrintHistoryBundle(
      this.root.path,
      request.archiveId,
      request.effectiveSettings,
      project3mfPath,
      this.config.threeMfPolicy === 'ask',
    )
    return (await this.refresh()).snapshot
  }

  public async updatePrintHistory(request: UpdatePrintHistoryRequest): Promise<DashboardSnapshot> {
    if (!this.root) throw appError('workspace-not-connected')
    if (
      !request ||
      typeof request.id !== 'string' ||
      !isPrintResult(request.result) ||
      typeof request.note !== 'string' ||
      request.note.length > 2_000
    ) {
      throw appError('invalid-print-result')
    }
    await updatePrintHistoryRecord(this.root.path, request).catch((error: unknown) => {
      if (error instanceof Error && error.message === 'print-history-not-found') {
        throw appError('print-history-not-found')
      }
      throw error
    })
    return (await this.refresh()).snapshot
  }

  public async openPrintHistoryRecord(id: string): Promise<void> {
    if (!this.root) throw appError('workspace-not-connected')
    const path = await resolvePrintHistoryBundlePath(this.root.path, id).catch(() => {
      throw appError('print-history-not-found')
    })
    const message = await shell.openPath(path)
    if (message) throw new Error(message)
  }

  public async deletePrintHistory(id: string): Promise<DashboardSnapshot> {
    if (!this.root) throw appError('workspace-not-connected')
    const path = await resolvePrintHistoryBundlePath(this.root.path, id).catch(() => {
      throw appError('print-history-not-found')
    })
    await shell.trashItem(path)
    return (await this.refresh()).snapshot
  }

  public async listChangeProposals(): Promise<readonly ChangeProposalView[]> {
    return this.proposalStore.list()
  }

  public async queueChangeProposal(
    request: QueueChangeProposalRequest,
  ): Promise<ChangeProposalView> {
    await this.requireValidProposalTarget(request)
    return this.proposalStore.queue(request)
  }

  public async approveChangeProposal(
    request: ApproveChangeProposalRequest,
  ): Promise<ChangeProposalView> {
    if (!request || typeof request.id !== 'string' || !request.id) {
      throw appError('invalid-change-proposal')
    }
    const proposal = (await this.proposalStore.list()).find(
      (candidate) => candidate.id === request.id,
    )
    if (!proposal) throw appError('change-proposal-not-found')
    await this.requireValidProposalTarget({
      ...proposal,
      destination: request.destination,
      ...(request.newPresetName === undefined ? {} : { newPresetName: request.newPresetName }),
    })
    return this.proposalStore.approve(request)
  }

  public async rejectChangeProposal(id: string): Promise<ChangeProposalView> {
    if (typeof id !== 'string' || !id) throw appError('invalid-change-proposal')
    return this.proposalStore.reject(id)
  }

  public async completeChangeProposal(
    request: CompleteChangeProposalRequest,
  ): Promise<ChangeProposalView> {
    return this.proposalStore.complete(request)
  }

  public async completePresetFileChange(request: CompletePresetFileChangeRequest) {
    if (!this.root) throw appError('workspace-not-connected')
    return this.presetFileChangeStore.complete(workspacePaths(this.root.path).userPresets, request)
  }

  public async publishNativeState(
    request: PublishNativeStateRequest,
  ): Promise<PublishedNativeState> {
    const published = await this.nativeStateStore.publish(
      this.sessionCodexScope ?? this.config.codexPermissions.scope,
      request,
    )
    await this.reconcileApprovedProposals(published)
    await this.reconcileCompletedProposals(published)
    return published
  }

  public async prepareProjectExport(
    archiveId: string,
    explicitConsent = false,
  ): Promise<PrepareProjectExportResult> {
    if (!this.root) throw appError('workspace-not-connected')
    if (typeof explicitConsent !== 'boolean') throw appError('invalid-project-3mf')
    if (!this.config.autoArchive) {
      return { status: 'skipped', destinationPath: null, reason: 'auto-archive-disabled' }
    }
    if (this.config.threeMfPolicy === 'never') {
      return { status: 'skipped', destinationPath: null, reason: 'policy-never' }
    }
    if (this.config.threeMfPolicy === 'ask' && !explicitConsent) {
      return { status: 'skipped', destinationPath: null, reason: 'explicit-selection-required' }
    }
    const destinationPath = await prepareProject3mfExport(this.root.path, archiveId)
    if (this.config.threeMfPolicy === 'ask') this.project3mfGrants.add(destinationPath)
    return {
      status: 'ready',
      destinationPath,
      reason: null,
    }
  }

  public async guardProposalRollback(
    request: GuardProposalRollbackRequest,
  ): Promise<RollbackGuardResult> {
    return this.proposalStore.guardRollback(request)
  }

  public async getPresetDiff(presetId: string): Promise<PresetDiff> {
    const preset = this.presets.find((candidate) => candidate.id === presetId)
    if (!preset) throw appError('preset-not-found')
    return readPresetDiff(preset)
  }

  public async initializePresetGit(): Promise<DashboardSnapshot> {
    if (!this.root) throw appError('workspace-not-connected')
    await initializePresetRepository(workspacePaths(this.root.path).userPresets)
    return (await this.refresh()).snapshot
  }

  public async savePresetVersion(request: SavePresetVersionRequest): Promise<DashboardSnapshot> {
    if (!this.root) throw appError('workspace-not-connected')
    if (!request || typeof request.message !== 'string') {
      throw appError('invalid-version-message')
    }
    await savePresetVersion(workspacePaths(this.root.path).userPresets, request.message)
    return (await this.refresh()).snapshot
  }

  public async listPresetVersions(): Promise<readonly PresetVersionView[]> {
    if (!this.root) throw appError('workspace-not-connected')
    const userPresetsPath = workspacePaths(this.root.path).userPresets
    if (!(await readGitSnapshot(userPresetsPath)).isRepository) {
      throw appError('git-unavailable')
    }
    return readPresetVersions(userPresetsPath)
  }

  public async restorePresetVersion(
    request: RestorePresetVersionRequest,
  ): Promise<DashboardSnapshot> {
    if (!this.root) throw appError('workspace-not-connected')
    if (!request || typeof request.revision !== 'string') {
      throw appError('git-history-not-found')
    }
    await restorePresetVersion(workspacePaths(this.root.path).userPresets, request.revision)
    return (await this.refresh()).snapshot
  }

  public async openRoot(): Promise<void> {
    if (!this.root) throw appError('workspace-not-connected')
    const message = await shell.openPath(this.root.path)
    if (message) throw new Error(message)
  }

  public async launchOrca(): Promise<void> {
    const executable = this.snapshot?.root.orcaExecutable ?? (await findOrcaExecutable())
    if (!executable) throw appError('orca-not-found')
    launchDetached(executable)
  }

  private async performRefresh(): Promise<RefreshResult> {
    const previousSignature = this.signature
    await this.codexSessionStore.heartbeat(
      this.sessionCodexScope ?? this.config.codexPermissions.scope,
    )
    if (!this.root) {
      const emptySnapshot = this.createEmptySnapshot()
      this.snapshot = emptySnapshot
      this.signature = snapshotSignature(emptySnapshot)
      return { snapshot: emptySnapshot, changed: this.signature !== previousSignature }
    }

    const paths = workspacePaths(this.root.path)
    const [presets, gitSnapshot, orcaExecutable, printHistory, nativeState] = await Promise.all([
      scanPresets(paths.userPresets),
      readGitSnapshot(paths.userPresets),
      findOrcaExecutable(),
      listPrintHistory(this.root.path),
      this.nativeStateStore.readFresh(),
    ])
    await Promise.all([
      applyGitState(paths.userPresets, presets, gitSnapshot),
      applyLatestPrints(this.root.path, presets),
    ])
    this.presets = presets
    await this.proposalStore.importInbox(async (request) => {
      try {
        if ((this.sessionCodexScope ?? this.config.codexPermissions.scope) === 'general') {
          return false
        }
        await this.requireValidProposalTarget(request)
        return true
      } catch {
        return false
      }
    })
    await this.presetFileChangeStore.importInbox()
    const presetFileChanges = await this.presetFileChangeStore.reconcileDisk(paths.userPresets)
    const changeProposals = await this.proposalStore.list()

    const warnings: DashboardWarning[] = []

    const views = presets.map(toPresetView)
    const snapshot: DashboardSnapshot = {
      generatedAt: new Date().toISOString(),
      root: {
        path: this.root.path,
        userPresetsPath: paths.userPresets,
        printHistoryPath: paths.printHistory,
        source: this.root.source,
        isGitRepository: gitSnapshot.isRepository,
        latestPresetVersion: gitSnapshot.latestVersion,
        orcaExecutable,
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
      printHistory,
      settings: settingsView(this.config, this.sessionCodexScope),
      writeCapabilities: nativeState?.writeCapabilities ?? null,
      changeProposals,
      presetFileChanges,
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
        userPresetsPath: '',
        printHistoryPath: '',
        source: 'automatic',
        isGitRepository: false,
        latestPresetVersion: null,
        orcaExecutable: null,
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
      printHistory: [],
      settings: settingsView(this.config, this.sessionCodexScope),
      writeCapabilities: null,
      changeProposals: [],
      presetFileChanges: [],
      warnings: ['workspace-not-found'],
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

  private async requireValidProposalTarget(
    request: Pick<QueueChangeProposalRequest, 'presetId' | 'presetKind' | 'destination'>,
  ): Promise<InternalPreset | null> {
    if (
      !request ||
      typeof request.presetId !== 'string' ||
      (request.presetKind !== 'machine' &&
        request.presetKind !== 'process' &&
        request.presetKind !== 'filament') ||
      (request.destination !== 'current-project' &&
        request.destination !== 'update-current-preset' &&
        request.destination !== 'save-as-new-preset')
    ) {
      throw appError('invalid-change-proposal')
    }
    if (request.presetKind === 'machine') {
      throw appError('invalid-change-proposal')
    }
    const preset = this.presets.find((candidate) => candidate.id === request.presetId)
    if (!preset) {
      if (request.destination !== 'save-as-new-preset') {
        throw appError('invalid-change-proposal')
      }
      const nativeState = await this.nativeStateStore.readFresh()
      const selections =
        request.presetKind === 'process'
          ? nativeState
            ? [nativeState.selections.process]
            : []
          : (nativeState?.selections.filaments ?? [])
      const selected = selections.find(
        (selection) =>
          request.presetId === selection.name ||
          request.presetId === `orca:${request.presetKind}:${selection.name}`,
      )
      if (!selected || !selected.isSystem || selected.isUser) {
        throw appError('invalid-change-proposal')
      }
      return null
    }
    if (preset.kind !== request.presetKind) {
      throw appError('invalid-change-proposal')
    }
    if (preset.isSystem && request.destination === 'update-current-preset') {
      throw appError('invalid-change-proposal')
    }
    return preset
  }

  private async reconcileApprovedProposals(state: PublishedNativeState): Promise<void> {
    if (!state.settings) return
    const stateTime = Date.parse(state.generatedAt)
    if (Number.isNaN(stateTime)) return

    const proposals = await this.proposalStore.list()
    for (const proposal of proposals) {
      if (proposal.status !== 'pending' || proposal.approvedAt === null) continue
      const approvedTime = Date.parse(proposal.approvedAt)
      if (
        Number.isNaN(approvedTime) ||
        stateTime - approvedTime < PROPOSAL_RECONCILIATION_GRACE_MS
      ) {
        continue
      }

      const localPreset = this.presets.find((preset) => preset.id === proposal.presetId)
      const nativePrefix = `orca:${proposal.presetKind}:`
      const originalName =
        localPreset?.name ??
        (proposal.presetId.startsWith(nativePrefix)
          ? proposal.presetId.slice(nativePrefix.length)
          : proposal.presetId)
      const expectedName =
        proposal.destination === 'save-as-new-preset' ? proposal.newPresetName : originalName
      const selectedNames =
        proposal.presetKind === 'process'
          ? [state.selections.process.name]
          : state.selections.filaments.map((filament) => filament.name)
      if (!expectedName || !selectedNames.includes(expectedName)) continue

      const currentValues: Record<string, (typeof proposal.after)[string]> = {}
      let complete = true
      for (const key of Object.keys(proposal.after)) {
        if (!Object.prototype.hasOwnProperty.call(state.settings, key)) {
          complete = false
          break
        }
        currentValues[key] = state.settings[key]!
      }
      if (!complete) continue
      const applied = parameterSnapshotsEqual(currentValues, proposal.after)

      await this.proposalStore.complete({
        id: proposal.id,
        receipt: {
          authority: 'orca',
          status: applied ? 'applied' : 'failed',
          revision: state.revision,
          before: proposal.before,
          after: applied ? currentValues : proposal.after,
          ...(applied
            ? {}
            : {
                error: "The approved change is not present in Orca's current settings.",
              }),
        },
      })
    }
  }

  private async reconcileCompletedProposals(state: PublishedNativeState): Promise<void> {
    if (!state.settings) return

    const proposals = await this.proposalStore.list()
    for (const proposal of proposals) {
      if (
        proposal.approvedAt === null ||
        !['applied', 'partially-rolled-back', 'changed-after-apply', 'rolled-back'].includes(
          proposal.status,
        ) ||
        proposal.authoritativeRevision === state.revision
      ) {
        continue
      }

      const localPreset = this.presets.find((preset) => preset.id === proposal.presetId)
      const nativePrefix = `orca:${proposal.presetKind}:`
      const originalName =
        localPreset?.name ??
        (proposal.presetId.startsWith(nativePrefix)
          ? proposal.presetId.slice(nativePrefix.length)
          : proposal.presetId)
      const expectedName =
        proposal.destination === 'save-as-new-preset' ? proposal.newPresetName : originalName
      const selectedNames =
        proposal.presetKind === 'process'
          ? [state.selections.process.name]
          : state.selections.filaments.map((filament) => filament.name)
      if (!expectedName || !selectedNames.includes(expectedName)) continue

      const currentValues: Record<string, (typeof proposal.after)[string]> = {}
      let complete = true
      for (const key of Object.keys(proposal.after)) {
        if (!Object.prototype.hasOwnProperty.call(state.settings, key)) {
          complete = false
          break
        }
        currentValues[key] = state.settings[key]!
      }
      if (!complete) continue

      await this.proposalStore.reconcileNativeState(proposal.id, state.revision, currentValues)
    }
  }
}

function settingsView(
  config: AppConfig,
  sessionCodexScope: CodexPermissionScope | null,
): DashboardSnapshot['settings'] {
  return {
    language: config.language,
    autoArchive: config.autoArchive,
    threeMfPolicy: config.threeMfPolicy,
    codexPermissions: {
      scope: sessionCodexScope ?? config.codexPermissions.scope,
      fileGrants: [...config.codexPermissions.fileGrants],
    },
  }
}

async function validateCodexFile(path: string): Promise<string> {
  if (
    typeof path !== 'string' ||
    !isAbsolute(path) ||
    !['.stl', '.3mf'].includes(extname(path).toLowerCase())
  ) {
    throw appError('invalid-file-grant')
  }
  const normalized = resolve(path)
  const value = await lstat(normalized).catch(() => null)
  if (!value || !value.isFile() || value.isSymbolicLink()) {
    throw appError('invalid-file-grant')
  }
  return normalized
}
