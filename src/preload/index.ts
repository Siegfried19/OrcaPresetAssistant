import { contextBridge, ipcRenderer } from 'electron'

import {
  IPC_CHANNELS,
  type DashboardApi,
  type DashboardSnapshot,
  type Language,
  type RecordPrintRequest,
} from '@shared/contracts'

const api: DashboardApi = {
  getSnapshot: () => ipcRenderer.invoke(IPC_CHANNELS.getSnapshot),
  refresh: () => ipcRenderer.invoke(IPC_CHANNELS.refresh),
  chooseRoot: (language: Language) => ipcRenderer.invoke(IPC_CHANNELS.chooseRoot, language),
  recordPrint: (request: RecordPrintRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.recordPrint, request),
  getPresetDiff: (presetId: string) => ipcRenderer.invoke(IPC_CHANNELS.getPresetDiff, presetId),
  openRoot: () => ipcRenderer.invoke(IPC_CHANNELS.openRoot),
  launchBambu: () => ipcRenderer.invoke(IPC_CHANNELS.launchBambu),
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
