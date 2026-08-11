import type {
  ApproveChangeProposalRequest,
  ChangeProposalView,
  CodexPermissionScope,
  DashboardApi,
  DashboardSnapshot,
  DashboardWarning,
} from '@shared/contracts'
import type { AuthoritativeChangeReceipt } from '@shared/helper-http'
import { parameterSnapshotsEqual } from '@shared/parameter-comparison'

import {
  consumeHelperSession,
  createHelperDashboardApi,
  createHelperHttpClient,
  type HelperHttpClient,
} from './helper-http-client'
import {
  applyOrcaProposal,
  errorText,
  exportOrcaProjectCopy,
  isOrcaRevisionConflict,
  parsePrintSubmitted,
  readPendingOrcaPrint,
  readOrcaProject,
  readOrcaSettings,
  readOrcaState,
  readOrcaWorkspace,
  resolveOrcaNativeBridge,
  rollbackOrcaProposal,
  setOrcaWorkspace,
  type OrcaNativeBridge,
  type OrcaPrintSubmittedResult,
} from './orca-native-bridge'

const NATIVE_HEARTBEAT_MS = 4_000
const LAST_ARCHIVED_PRINT_SESSION_KEY = 'orca-preset-assistant.last-archived-print'

export class PrintArchiveGuard {
  private readonly active = new Set<string>()
  private readonly completed = new Set<string>()

  public constructor(private readonly sessionStorage: Storage) {}

  public claim(archiveId: string): boolean {
    if (
      this.active.has(archiveId) ||
      this.completed.has(archiveId) ||
      this.readLastCompleted() === archiveId
    ) {
      return false
    }
    this.active.add(archiveId)
    return true
  }

  public complete(archiveId: string): void {
    this.active.delete(archiveId)
    this.completed.add(archiveId)
    try {
      this.sessionStorage.setItem(LAST_ARCHIVED_PRINT_SESSION_KEY, archiveId)
    } catch {
      // The in-memory guard still prevents duplicates when tab storage is unavailable.
    }
  }

  public release(archiveId: string): void {
    this.active.delete(archiveId)
  }

  private readLastCompleted(): string | null {
    try {
      return this.sessionStorage.getItem(LAST_ARCHIVED_PRINT_SESSION_KEY)
    } catch {
      return null
    }
  }
}

interface DashboardHostEnvironment {
  readonly dashboard?: DashboardApi
  readonly location: Location
  readonly history: History
  readonly sessionStorage: Storage
  readonly fetch: typeof fetch
  readonly confirm?: (message?: string) => boolean
  addEventListener(type: string, listener: EventListener): void
  removeEventListener(type: string, listener: EventListener): void
  setInterval(handler: TimerHandler, timeout?: number): number
  clearInterval(id: number): void
}

export interface DashboardHost {
  readonly kind: 'electron' | 'helper' | 'orca'
  readonly api: DashboardApi
  dispose(): void
}

interface DashboardHostOptions {
  readonly startBackgroundTasks?: boolean
}

function sameWorkspace(left: string, right: string): boolean {
  const normalize = (value: string): string =>
    value
      .trim()
      .replaceAll('/', '\\')
      .replace(/[\\]+$/u, '')
      .toLocaleLowerCase('en-US')
  return Boolean(left) && normalize(left) === normalize(right)
}

function withWarning(snapshot: DashboardSnapshot, warning: DashboardWarning): DashboardSnapshot {
  if (snapshot.warnings.includes(warning)) return snapshot
  return { ...snapshot, warnings: [warning, ...snapshot.warnings] }
}

function withoutHostWarnings(snapshot: DashboardSnapshot): DashboardSnapshot {
  return {
    ...snapshot,
    warnings: snapshot.warnings.filter(
      (warning) => warning !== 'workspace-mismatch' && warning !== 'orca-restart-required',
    ),
  }
}

function requestedNativeRevision(value: string): number {
  const revision = Number(value)
  if (!Number.isSafeInteger(revision) || revision < 1) {
    throw new Error('invalid-change-proposal')
  }
  return revision
}

function expectedPresetName(proposal: ChangeProposalView, snapshot: DashboardSnapshot): string {
  const local = snapshot.presets.find((preset) => preset.id === proposal.presetId)
  if (local) return local.name
  const nativePrefix = `orca:${proposal.presetKind}:`
  return proposal.presetId.startsWith(nativePrefix)
    ? proposal.presetId.slice(nativePrefix.length)
    : proposal.presetId
}

function nativeFailureRevision(error: unknown, bridge: OrcaNativeBridge): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'revision' in error &&
    Number.isSafeInteger(error.revision)
  ) {
    return String(error.revision)
  }
  return String(bridge.revision)
}

class OrcaDashboardApi implements DashboardApi {
  private readonly listeners = new Set<(snapshot: DashboardSnapshot) => void>()
  private readonly printArchiveGuard: PrintArchiveGuard
  private snapshot: DashboardSnapshot | null = null
  private heartbeat: number | null = null
  private nativeSync: Promise<void> | null = null
  private readonly onPrintSubmitted = (event: Event): void => {
    try {
      const print = parsePrintSubmitted((event as CustomEvent<unknown>).detail)
      void this.archiveOrcaPrint(print).catch(() => undefined)
    } catch {
      // Native payloads must pass the same strict boundary as polled payloads.
    }
  }

  public constructor(
    private readonly helper: DashboardApi,
    private readonly client: HelperHttpClient,
    private readonly bridge: OrcaNativeBridge,
    private readonly environment: DashboardHostEnvironment,
    startBackgroundTasks: boolean,
  ) {
    this.printArchiveGuard = new PrintArchiveGuard(environment.sessionStorage)
    if (startBackgroundTasks) {
      environment.addEventListener('orca-preset-assistant-print-submitted', this.onPrintSubmitted)
      environment.addEventListener('orca-preset-assistant:print-submitted', this.onPrintSubmitted)
      this.heartbeat = environment.setInterval(() => {
        void this.publishNativeState().catch(() => undefined)
      }, NATIVE_HEARTBEAT_MS)
    }
  }

  public dispose(): void {
    if (this.heartbeat !== null) this.environment.clearInterval(this.heartbeat)
    this.environment.removeEventListener(
      'orca-preset-assistant-print-submitted',
      this.onPrintSubmitted,
    )
    this.environment.removeEventListener(
      'orca-preset-assistant:print-submitted',
      this.onPrintSubmitted,
    )
    this.heartbeat = null
    this.listeners.clear()
  }

  private emit(snapshot: DashboardSnapshot): void {
    this.snapshot = snapshot
    for (const listener of this.listeners) listener(snapshot)
  }

  private async reconcileWorkspace(snapshot: DashboardSnapshot): Promise<DashboardSnapshot> {
    if (!snapshot.root.path) return snapshot
    try {
      const response = await readOrcaWorkspace(this.bridge)
      let next = withoutHostWarnings(snapshot)
      if (!sameWorkspace(snapshot.root.path, response.data.configuredWorkspace)) {
        next = withWarning(next, 'workspace-mismatch')
      } else if (
        response.data.restartRequired ||
        (response.data.activeWorkspace &&
          !sameWorkspace(snapshot.root.path, response.data.activeWorkspace))
      ) {
        next = withWarning(next, 'orca-restart-required')
      }
      return next
    } catch {
      return snapshot
    }
  }

  private async track(snapshot: DashboardSnapshot): Promise<DashboardSnapshot> {
    const reconciled = await this.reconcileWorkspace(snapshot)
    this.snapshot = reconciled
    void this.publishNativeState().catch(() => undefined)
    return reconciled
  }

  private async requireSnapshot(): Promise<DashboardSnapshot> {
    if (this.snapshot) return this.snapshot
    return this.track(await this.helper.getSnapshot())
  }

  private async recordFailedProposal(proposal: ChangeProposalView, error: unknown): Promise<never> {
    const receipt: AuthoritativeChangeReceipt = {
      authority: 'orca',
      status: 'failed',
      revision: nativeFailureRevision(error, this.bridge),
      before: proposal.before,
      after: proposal.after,
      error: errorText(error),
    }
    await this.client.request(
      'completeChangeProposal',
      { id: proposal.id, receipt },
      { nativeBridge: true },
    )
    try {
      this.emit(await this.track(await this.helper.refresh()))
    } catch {
      // The failed authoritative receipt is already durable.
    }
    throw error instanceof Error ? error : new Error(receipt.error)
  }

  private async archiveOrcaPrint(
    print: OrcaPrintSubmittedResult,
    currentSnapshot?: DashboardSnapshot,
  ): Promise<void> {
    if (!this.printArchiveGuard.claim(print.archiveId)) return
    try {
      const snapshot = currentSnapshot ?? (await this.requireSnapshot())
      if (!snapshot.settings.autoArchive) return

      let includeProjectPath: string | null = null
      let exportFailed = false
      const shouldExport =
        snapshot.settings.threeMfPolicy === 'always' ||
        (snapshot.settings.threeMfPolicy === 'ask' &&
          (this.environment.confirm?.(
            snapshot.settings.language === 'en'
              ? 'Save a copy of the current Orca project in this print history record?'
              : '是否把当前 Orca 项目副本保存到这次打印记录？',
          ) ??
            false))
      if (shouldExport) {
        try {
          const prepared = await this.client.request(
            'prepareProjectExport',
            {
              archiveId: print.archiveId,
              ...(snapshot.settings.threeMfPolicy === 'ask' ? { explicitConsent: true } : {}),
            },
            { nativeBridge: true },
          )
          if (prepared.status === 'ready' && prepared.destinationPath) {
            const exported = await exportOrcaProjectCopy(this.bridge, prepared.destinationPath)
            if (!sameWorkspace(exported.data.path, prepared.destinationPath)) {
              throw new Error('invalid-project-export-path')
            }
            includeProjectPath = exported.data.path
          }
        } catch {
          exportFailed = true
        }
      }
      const next = await this.client.request(
        'recordOrcaPrint',
        {
          archiveId: print.archiveId,
          ...(includeProjectPath ? { project3mfPath: includeProjectPath } : {}),
          effectiveSettings: {
            authority: 'orca',
            revision: print.revision,
            effective: print.effectiveSettings,
            selections: print.presets,
          },
        },
        { nativeBridge: true },
      )
      this.printArchiveGuard.complete(print.archiveId)
      const tracked = await this.track(next)
      this.emit(exportFailed ? withWarning(tracked, 'project-archive-failed') : tracked)
    } finally {
      this.printArchiveGuard.release(print.archiveId)
    }
  }

  public async publishNativeState(): Promise<void> {
    if (this.nativeSync) return this.nativeSync
    this.nativeSync = (async () => {
      const snapshot = await this.requireSnapshot()
      const scope: CodexPermissionScope = snapshot.settings.codexPermissions.scope
      const state = await readOrcaState(this.bridge)
      let revision = state.revision
      let selections = state.data.presets
      const writeCapabilities = state.data.writeCapabilities
      let settings
      let project

      if (scope === 'current-settings' || scope === 'current-project') {
        const nativeSettings = await readOrcaSettings(this.bridge)
        revision = nativeSettings.revision
        selections = nativeSettings.data.presets
        // Keep the catalog from state.get. Duplicating it in settings.get can push
        // the WebView response past its practical message-size boundary.
        settings = nativeSettings.data.effective
      }
      if (scope === 'current-project') {
        const nativeProject = await readOrcaProject(this.bridge)
        revision = nativeProject.revision
        project = nativeProject.data
      }

      await this.client.request(
        'publishNativeState',
        {
          revision,
          selections,
          writeCapabilities,
          ...(settings ? { settings } : {}),
          ...(project ? { project } : {}),
        },
        { nativeBridge: true },
      )
      if (
        snapshot.changeProposals.some(
          (proposal) =>
            proposal.approvedAt !== null &&
            !['rejected', 'failed'].includes(proposal.status) &&
            proposal.authoritativeRevision !== String(revision),
        )
      ) {
        this.emit(await this.track(await this.helper.refresh()))
      }
      if (snapshot.settings.autoArchive) {
        const pending = await readPendingOrcaPrint(this.bridge)
        if (pending.data) await this.archiveOrcaPrint(pending.data, snapshot)
      }
    })().finally(() => {
      this.nativeSync = null
    })
    return this.nativeSync
  }

  public async getSnapshot(): Promise<DashboardSnapshot> {
    return this.track(await this.helper.getSnapshot())
  }

  public async refresh(): Promise<DashboardSnapshot> {
    return this.track(await this.helper.refresh())
  }

  public async chooseRoot(
    language: Parameters<DashboardApi['chooseRoot']>[0],
  ): Promise<DashboardSnapshot | null> {
    const snapshot = await this.helper.chooseRoot(language)
    if (!snapshot) return null
    try {
      await setOrcaWorkspace(this.bridge, snapshot.root.path)
      return this.track(snapshot)
    } catch (error) {
      this.emit(withWarning(snapshot, 'workspace-mismatch'))
      throw error
    }
  }

  public async updateSettings(
    request: Parameters<DashboardApi['updateSettings']>[0],
  ): Promise<DashboardSnapshot> {
    return this.track(await this.helper.updateSettings(request))
  }

  public async setCodexScope(
    scope: Parameters<DashboardApi['setCodexScope']>[0],
  ): Promise<DashboardSnapshot> {
    return this.track(await this.helper.setCodexScope(scope))
  }

  public async chooseCodexFileGrant(
    language: Parameters<DashboardApi['chooseCodexFileGrant']>[0],
  ): Promise<DashboardSnapshot | null> {
    const snapshot = await this.helper.chooseCodexFileGrant(language)
    return snapshot ? this.track(snapshot) : null
  }

  public async revokeCodexFileGrant(path: string): Promise<DashboardSnapshot> {
    return this.track(await this.helper.revokeCodexFileGrant(path))
  }

  public chooseProject3mf(language: Parameters<DashboardApi['chooseProject3mf']>[0]) {
    return this.helper.chooseProject3mf(language)
  }

  public async recordPrint(
    request: Parameters<DashboardApi['recordPrint']>[0],
  ): Promise<DashboardSnapshot> {
    return this.track(await this.helper.recordPrint(request))
  }

  public async updatePrintHistory(
    request: Parameters<DashboardApi['updatePrintHistory']>[0],
  ): Promise<DashboardSnapshot> {
    return this.track(await this.helper.updatePrintHistory(request))
  }

  public openPrintHistoryRecord(id: string): Promise<void> {
    return this.helper.openPrintHistoryRecord(id)
  }

  public async deletePrintHistory(id: string): Promise<DashboardSnapshot> {
    return this.track(await this.helper.deletePrintHistory(id))
  }

  public listChangeProposals(): Promise<readonly ChangeProposalView[]> {
    return this.helper.listChangeProposals()
  }

  public queueChangeProposal(
    request: Parameters<DashboardApi['queueChangeProposal']>[0],
  ): Promise<ChangeProposalView> {
    return this.helper.queueChangeProposal(request)
  }

  public async approveChangeProposal(
    request: ApproveChangeProposalRequest,
  ): Promise<ChangeProposalView> {
    const snapshot = await this.requireSnapshot()
    if (snapshot.warnings.includes('workspace-mismatch')) {
      throw new Error('workspace-mismatch')
    }
    const pending = snapshot.changeProposals.find((proposal) => proposal.id === request.id)
    if (!pending || pending.status !== 'pending' || pending.approvedAt !== null) {
      throw new Error('invalid-change-proposal')
    }
    const expectedRevision = requestedNativeRevision(pending.requestedRevision)
    const selectedPresetName = expectedPresetName(pending, snapshot)

    const approved = await this.helper.approveChangeProposal(request)
    if (!approved.approvedAt) {
      throw new Error('invalid-change-proposal')
    }

    let response
    try {
      response = await applyOrcaProposal(
        this.bridge,
        {
          destination: approved.destination,
          presetType: approved.presetKind,
          expectedPresetName: selectedPresetName,
          ...(approved.newPresetName ? { newName: approved.newPresetName } : {}),
          changes: approved.after,
          reason: approved.reason,
          approvedAt: approved.approvedAt,
        },
        expectedRevision,
      )
    } catch (error) {
      return this.recordFailedProposal(approved, error)
    }

    if (response.data.status !== 'applied') {
      return this.recordFailedProposal(
        approved,
        Object.assign(new Error('Orca reported that the requested values were unchanged.'), {
          revision: response.revision,
        }),
      )
    }
    if (response.data.rollbackGuard.validAtRevision !== response.revision) {
      return this.recordFailedProposal(
        approved,
        Object.assign(new Error('Orca returned an invalid rollback guard.'), {
          revision: response.revision,
        }),
      )
    }

    try {
      return await this.client.request(
        'completeChangeProposal',
        {
          id: approved.id,
          receipt: {
            authority: 'orca',
            status: 'applied',
            revision: String(response.revision),
            before: response.data.before,
            after: response.data.after,
            rollbackGuard: {
              id: response.data.rollbackGuard.id,
              validAtRevision: String(response.data.rollbackGuard.validAtRevision),
            },
          },
        },
        { nativeBridge: true },
      )
    } catch (error) {
      try {
        this.emit(await this.track(await this.helper.refresh()))
      } catch {
        // Approval is durable; keep the panel in its authoritative pending state.
      }
      throw error
    }
  }

  public rejectChangeProposal(id: string): Promise<ChangeProposalView> {
    return this.helper.rejectChangeProposal(id)
  }

  public async rollbackChangeProposal(id: string): Promise<ChangeProposalView> {
    const snapshot = await this.requireSnapshot()
    const proposal = snapshot.changeProposals.find((candidate) => candidate.id === id)
    if (
      !proposal ||
      proposal.status !== 'applied' ||
      !proposal.rollbackGuard ||
      proposal.authoritativeRevision !== proposal.rollbackGuard.validAtRevision
    ) {
      throw new Error('invalid-change-proposal')
    }

    const expectedRevision = requestedNativeRevision(proposal.rollbackGuard.validAtRevision)
    let response
    try {
      response = await rollbackOrcaProposal(
        this.bridge,
        proposal.rollbackGuard.id,
        expectedRevision,
      )
    } catch (error) {
      if (!isOrcaRevisionConflict(error)) throw error
      await this.publishNativeState()
      const refreshed = await this.track(await this.helper.refresh())
      this.emit(refreshed)
      const reconciled = refreshed.changeProposals.find((candidate) => candidate.id === id)
      if (reconciled && (reconciled.status !== 'applied' || reconciled.rollbackGuard === null)) {
        return reconciled
      }
      throw error
    }
    if (
      !parameterSnapshotsEqual(response.data.before, proposal.after) ||
      !parameterSnapshotsEqual(response.data.after, proposal.before)
    ) {
      throw new Error('invalid-orca-native-response')
    }
    const completed = await this.client.request(
      'completeChangeProposal',
      {
        id: proposal.id,
        receipt: {
          authority: 'orca',
          status: 'rolled-back',
          revision: String(response.revision),
          before: proposal.before,
          after: proposal.after,
        },
      },
      { nativeBridge: true },
    )
    this.emit(await this.track(await this.helper.refresh()))
    return completed
  }

  public guardProposalRollback(request: Parameters<DashboardApi['guardProposalRollback']>[0]) {
    return this.helper.guardProposalRollback(request)
  }

  public getPresetDiff(presetId: string) {
    return this.helper.getPresetDiff(presetId)
  }

  public async initializePresetGit(): Promise<DashboardSnapshot> {
    return this.track(await this.helper.initializePresetGit())
  }

  public async savePresetVersion(
    request: Parameters<DashboardApi['savePresetVersion']>[0],
  ): Promise<DashboardSnapshot> {
    return this.track(await this.helper.savePresetVersion(request))
  }

  public listPresetVersions() {
    return this.helper.listPresetVersions()
  }

  public async restorePresetVersion(
    request: Parameters<DashboardApi['restorePresetVersion']>[0],
  ): Promise<DashboardSnapshot> {
    return this.track(await this.helper.restorePresetVersion(request))
  }

  public openRoot(): Promise<void> {
    return this.helper.openRoot()
  }

  public launchOrca(): Promise<void> {
    return Promise.resolve()
  }

  public onSnapshotChanged(callback: (snapshot: DashboardSnapshot) => void): () => void {
    this.listeners.add(callback)
    return () => this.listeners.delete(callback)
  }
}

function unavailableDashboard(error: unknown): DashboardApi {
  const reject = (): Promise<never> =>
    Promise.reject(error instanceof Error ? error : new Error(String(error)))
  return {
    getSnapshot: reject,
    refresh: reject,
    chooseRoot: reject,
    updateSettings: reject,
    setCodexScope: reject,
    chooseCodexFileGrant: reject,
    revokeCodexFileGrant: reject,
    chooseProject3mf: reject,
    recordPrint: reject,
    updatePrintHistory: reject,
    openPrintHistoryRecord: reject,
    deletePrintHistory: reject,
    listChangeProposals: reject,
    queueChangeProposal: reject,
    approveChangeProposal: reject,
    rejectChangeProposal: reject,
    rollbackChangeProposal: reject,
    guardProposalRollback: reject,
    getPresetDiff: reject,
    initializePresetGit: reject,
    savePresetVersion: reject,
    listPresetVersions: reject,
    restorePresetVersion: reject,
    openRoot: reject,
    launchOrca: reject,
    onSnapshotChanged: () => () => undefined,
  }
}

export function createDashboardHost(
  environment: DashboardHostEnvironment,
  options: DashboardHostOptions = {},
): DashboardHost {
  if (environment.dashboard) {
    return { kind: 'electron', api: environment.dashboard, dispose: () => undefined }
  }

  try {
    const sessionToken = consumeHelperSession(
      environment.location,
      environment.history,
      environment.sessionStorage,
    )
    const client = createHelperHttpClient({
      fetchImpl: environment.fetch.bind(environment),
      origin: environment.location.origin,
      sessionToken,
    })
    const helper = createHelperDashboardApi(client)
    const bridge = resolveOrcaNativeBridge(environment)
    if (!bridge) return { kind: 'helper', api: helper, dispose: () => undefined }

    const api = new OrcaDashboardApi(
      helper,
      client,
      bridge,
      environment,
      options.startBackgroundTasks !== false,
    )
    return { kind: 'orca', api, dispose: () => api.dispose() }
  } catch (error) {
    return { kind: 'helper', api: unavailableDashboard(error), dispose: () => undefined }
  }
}

let defaultHost: DashboardHost | null = null

export function getDashboardApi(): DashboardApi {
  defaultHost ??= createDashboardHost(window)
  return defaultHost.api
}
