import { contextBridge, ipcRenderer } from 'electron'

import {
  IPC_CHANNELS,
  type ApproveChangeProposalRequest,
  type CodexPermissionScope,
  type DashboardApi,
  type DashboardSnapshot,
  type GuardProposalRollbackRequest,
  type Language,
  type QueueChangeProposalRequest,
  type RecordPrintRequest,
  type RestorePresetVersionRequest,
  type SavePresetVersionRequest,
  type UpdatePrintHistoryRequest,
  type UpdateSettingsRequest,
} from '@shared/contracts'

const api: DashboardApi = {
  getSnapshot: () => ipcRenderer.invoke(IPC_CHANNELS.getSnapshot),
  refresh: () => ipcRenderer.invoke(IPC_CHANNELS.refresh),
  chooseRoot: (language: Language) => ipcRenderer.invoke(IPC_CHANNELS.chooseRoot, language),
  updateSettings: (request: UpdateSettingsRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.updateSettings, request),
  setCodexScope: (scope: CodexPermissionScope) =>
    ipcRenderer.invoke(IPC_CHANNELS.setCodexScope, scope),
  chooseCodexFileGrant: (language: Language) =>
    ipcRenderer.invoke(IPC_CHANNELS.chooseCodexFileGrant, language),
  revokeCodexFileGrant: (path: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.revokeCodexFileGrant, path),
  chooseProject3mf: (language: Language) =>
    ipcRenderer.invoke(IPC_CHANNELS.chooseProject3mf, language),
  recordPrint: (request: RecordPrintRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.recordPrint, request),
  updatePrintHistory: (request: UpdatePrintHistoryRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.updatePrintHistory, request),
  openPrintHistoryRecord: (id: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.openPrintHistoryRecord, id),
  deletePrintHistory: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.deletePrintHistory, id),
  listChangeProposals: () => ipcRenderer.invoke(IPC_CHANNELS.listChangeProposals),
  queueChangeProposal: (request: QueueChangeProposalRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.queueChangeProposal, request),
  approveChangeProposal: (request: ApproveChangeProposalRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.approveChangeProposal, request),
  rejectChangeProposal: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.rejectChangeProposal, id),
  rollbackChangeProposal: () => Promise.reject(new Error('orca-unavailable')),
  guardProposalRollback: (request: GuardProposalRollbackRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.guardProposalRollback, request),
  getPresetDiff: (presetId: string) => ipcRenderer.invoke(IPC_CHANNELS.getPresetDiff, presetId),
  initializePresetGit: () => ipcRenderer.invoke(IPC_CHANNELS.initializePresetGit),
  savePresetVersion: (request: SavePresetVersionRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.savePresetVersion, request),
  listPresetVersions: () => ipcRenderer.invoke(IPC_CHANNELS.listPresetVersions),
  restorePresetVersion: (request: RestorePresetVersionRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.restorePresetVersion, request),
  openRoot: () => ipcRenderer.invoke(IPC_CHANNELS.openRoot),
  launchOrca: () => ipcRenderer.invoke(IPC_CHANNELS.launchOrca),
  onSnapshotChanged: (callback: (snapshot: DashboardSnapshot) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, snapshot: DashboardSnapshot): void => {
      callback(snapshot)
    }
    ipcRenderer.on(IPC_CHANNELS.snapshotChanged, listener)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.snapshotChanged, listener)
    }
  },
}

contextBridge.exposeInMainWorld('dashboard', api)
