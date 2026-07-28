import { app, BrowserWindow } from 'electron'

import { IPC_CHANNELS } from '@shared/contracts'

import { DashboardService } from './application/dashboard-service'
import { registerIpcHandlers } from './ipc/register-handlers'
import { createMainWindow } from './window'

const hasSingleInstanceLock = app.requestSingleInstanceLock()
let mainWindow: BrowserWindow | null = null
let pollTimer: NodeJS.Timeout | null = null

async function start(): Promise<void> {
  const service = new DashboardService(app.getPath('appData'), app.getPath('userData'))
  await service.initialize()

  mainWindow = createMainWindow()
  registerIpcHandlers(mainWindow, service)

  pollTimer = setInterval(() => {
    void service.refresh().then(({ snapshot, changed }) => {
      if (changed && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC_CHANNELS.snapshotChanged, snapshot)
      }
    })
  }, 4_000)

  mainWindow.on('closed', () => {
    mainWindow = null
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  })
}

if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app
    .whenReady()
    .then(start)
    .catch((error: unknown) => {
      console.error(error)
      app.quit()
    })
}

app.on('second-instance', () => {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.focus()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void start()
  }
})

app.on('window-all-closed', () => {
  app.quit()
})
