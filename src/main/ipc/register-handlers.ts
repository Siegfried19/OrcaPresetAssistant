import { dialog, ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'

import {
  IPC_CHANNELS,
  type AppErrorCode,
  type Language,
  type RecordPrintRequest,
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
        language === 'en'
          ? 'Choose Bambu Studio user preset folder'
          : '选择 Bambu Studio 用户预设目录',
      properties: ['openDirectory'],
    })
    const selectedPath = result.filePaths[0]
    return result.canceled || !selectedPath ? null : service.setRoot(selectedPath)
  })

  ipcMain.handle(IPC_CHANNELS.recordPrint, async (event, request: RecordPrintRequest) => {
    assertTrusted(event, window)
    return service.recordPrint(request)
  })

  ipcMain.handle(IPC_CHANNELS.getPresetDiff, async (event, presetId: string) => {
    assertTrusted(event, window)
    if (typeof presetId !== 'string' || presetId.length > 1_024) {
      throw appError('invalid-preset-id')
    }
    return service.getPresetDiff(presetId)
  })

  ipcMain.handle(IPC_CHANNELS.openRoot, async (event) => {
    assertTrusted(event, window)
    await service.openRoot()
  })

  ipcMain.handle(IPC_CHANNELS.launchBambu, async (event) => {
    assertTrusted(event, window)
    await service.launchBambu()
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
