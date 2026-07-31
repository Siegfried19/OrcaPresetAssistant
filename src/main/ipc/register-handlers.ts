import { dialog, ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'

import {
  IPC_CHANNELS,
  type AppErrorCode,
  type ApproveChangeProposalRequest,
  type CodexPermissionScope,
  type GuardProposalRollbackRequest,
  type Language,
  type QueueChangeProposalRequest,
  type RecordPrintRequest,
  type RestorePresetVersionRequest,
  type SavePresetVersionRequest,
  type UpdatePrintHistoryRequest,
  type UpdateSettingsRequest,
} from '@shared/contracts'

import type { DashboardService } from '../application/dashboard-service'

function appError(code: AppErrorCode): Error {
  return new Error(code)
}

function assertTrusted(event: IpcMainInvokeEvent, window: BrowserWindow): void {
  if (event.sender.id !== window.webContents.id) {
    throw appError('untrusted-window')
  }
}

export function registerIpcHandlers(window: BrowserWindow, service: DashboardService): void {
  for (const channel of Object.values(IPC_CHANNELS)) {
    if (channel !== IPC_CHANNELS.snapshotChanged) {
      ipcMain.removeHandler(channel)
    }
  }

  ipcMain.handle(IPC_CHANNELS.getSnapshot, async (event) => {
    assertTrusted(event, window)
    return service.getSnapshot()
  })

  ipcMain.handle(IPC_CHANNELS.refresh, async (event) => {
    assertTrusted(event, window)
    return (await service.refresh()).snapshot
  })

  ipcMain.handle(IPC_CHANNELS.chooseRoot, async (event, language: Language) => {
    assertTrusted(event, window)
    const result = await dialog.showOpenDialog(window, {
      title:
        language === 'en' ? 'Choose Orca Preset Assistant workspace' : '选择 Orca 预设助手工作区',
      properties: ['openDirectory'],
    })
    const selectedPath = result.filePaths[0]
    return result.canceled || !selectedPath ? null : service.setRoot(selectedPath)
  })

  ipcMain.handle(IPC_CHANNELS.updateSettings, async (event, request: UpdateSettingsRequest) => {
    assertTrusted(event, window)
    return service.updateSettings(request)
  })

  ipcMain.handle(IPC_CHANNELS.setCodexScope, async (event, scope: CodexPermissionScope) => {
    assertTrusted(event, window)
    return service.setCodexScope(scope)
  })

  ipcMain.handle(IPC_CHANNELS.chooseCodexFileGrant, async (event, language: Language) => {
    assertTrusted(event, window)
    const result = await dialog.showOpenDialog(window, {
      title:
        language === 'en' ? 'Grant Codex access to one model file' : '授权 Codex 读取一个模型文件',
      properties: ['openFile'],
      filters: [{ name: '3D model', extensions: ['stl', '3mf'] }],
    })
    const selectedPath = result.filePaths[0]
    return result.canceled || !selectedPath ? null : service.grantCodexFile(selectedPath)
  })

  ipcMain.handle(IPC_CHANNELS.revokeCodexFileGrant, async (event, path: string) => {
    assertTrusted(event, window)
    return service.revokeCodexFile(path)
  })

  ipcMain.handle(IPC_CHANNELS.chooseProject3mf, async (event, language: Language) => {
    assertTrusted(event, window)
    const result = await dialog.showOpenDialog(window, {
      title: language === 'en' ? 'Choose the project 3MF to archive' : '选择要归档的项目 3MF',
      properties: ['openFile'],
      filters: [{ name: '3MF project', extensions: ['3mf'] }],
    })
    const selectedPath = result.filePaths[0]
    return result.canceled || !selectedPath ? null : service.grantProject3mf(selectedPath)
  })

  ipcMain.handle(IPC_CHANNELS.recordPrint, async (event, request: RecordPrintRequest) => {
    assertTrusted(event, window)
    return service.recordPrint(request)
  })

  ipcMain.handle(
    IPC_CHANNELS.updatePrintHistory,
    async (event, request: UpdatePrintHistoryRequest) => {
      assertTrusted(event, window)
      return service.updatePrintHistory(request)
    },
  )

  ipcMain.handle(IPC_CHANNELS.openPrintHistoryRecord, async (event, id: string) => {
    assertTrusted(event, window)
    return service.openPrintHistoryRecord(id)
  })

  ipcMain.handle(IPC_CHANNELS.deletePrintHistory, async (event, id: string) => {
    assertTrusted(event, window)
    return service.deletePrintHistory(id)
  })

  ipcMain.handle(IPC_CHANNELS.listChangeProposals, async (event) => {
    assertTrusted(event, window)
    return service.listChangeProposals()
  })

  ipcMain.handle(
    IPC_CHANNELS.queueChangeProposal,
    async (event, request: QueueChangeProposalRequest) => {
      assertTrusted(event, window)
      return service.queueChangeProposal(request)
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.approveChangeProposal,
    async (event, request: ApproveChangeProposalRequest) => {
      assertTrusted(event, window)
      return service.approveChangeProposal(request)
    },
  )

  ipcMain.handle(IPC_CHANNELS.rejectChangeProposal, async (event, id: string) => {
    assertTrusted(event, window)
    return service.rejectChangeProposal(id)
  })

  ipcMain.handle(
    IPC_CHANNELS.guardProposalRollback,
    async (event, request: GuardProposalRollbackRequest) => {
      assertTrusted(event, window)
      return service.guardProposalRollback(request)
    },
  )

  ipcMain.handle(IPC_CHANNELS.getPresetDiff, async (event, presetId: string) => {
    assertTrusted(event, window)
    if (typeof presetId !== 'string' || presetId.length > 1_024) {
      throw appError('invalid-preset-id')
    }
    return service.getPresetDiff(presetId)
  })

  ipcMain.handle(IPC_CHANNELS.initializePresetGit, async (event) => {
    assertTrusted(event, window)
    return service.initializePresetGit()
  })

  ipcMain.handle(
    IPC_CHANNELS.savePresetVersion,
    async (event, request: SavePresetVersionRequest) => {
      assertTrusted(event, window)
      return service.savePresetVersion(request)
    },
  )

  ipcMain.handle(IPC_CHANNELS.listPresetVersions, async (event) => {
    assertTrusted(event, window)
    return service.listPresetVersions()
  })

  ipcMain.handle(
    IPC_CHANNELS.restorePresetVersion,
    async (event, request: RestorePresetVersionRequest) => {
      assertTrusted(event, window)
      return service.restorePresetVersion(request)
    },
  )

  ipcMain.handle(IPC_CHANNELS.openRoot, async (event) => {
    assertTrusted(event, window)
    await service.openRoot()
  })

  ipcMain.handle(IPC_CHANNELS.launchOrca, async (event) => {
    assertTrusted(event, window)
    await service.launchOrca()
  })

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => {
    event.preventDefault()
  })
  window.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false)
  })
  window.webContents.session.setPermissionCheckHandler(() => false)
}
