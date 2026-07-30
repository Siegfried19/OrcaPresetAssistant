import { rm } from 'node:fs/promises'
import { rmSync } from 'node:fs'
import { join } from 'node:path'

import { app, BrowserWindow, dialog } from 'electron'

import { IPC_CHANNELS } from '@shared/contracts'
import {
  HELPER_HTTP_SESSION_FRAGMENT,
  HELPER_HTTP_STATE_FILE,
  type HelperHttpState,
} from '@shared/helper-http'

import { DashboardService } from './application/dashboard-service'
import { startHelperHttpServer, type RunningHelperHttpServer } from './helper-http-server'
import { parseHelperOptions } from './helper-options'
import { atomicWriteJson } from './infrastructure/atomic-write'
import { registerIpcHandlers } from './ipc/register-handlers'
import { createMainWindow } from './window'

const helperOptions = parseHelperOptions(process.argv)
const hasSingleInstanceLock = helperOptions ? true : app.requestSingleInstanceLock()
let mainWindow: BrowserWindow | null = null
let helperServer: RunningHelperHttpServer | null = null
let helperStateFile: string | null = null
let pollTimer: NodeJS.Timeout | null = null
let parentTimer: NodeJS.Timeout | null = null

function stopTimers(): void {
  if (pollTimer) clearInterval(pollTimer)
  if (parentTimer) clearInterval(parentTimer)
  pollTimer = null
  parentTimer = null
}

function startPolling(service: DashboardService): void {
  pollTimer = setInterval(() => {
    void service.refresh().then(({ snapshot, changed }) => {
      if (changed && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC_CHANNELS.snapshotChanged, snapshot)
      }
    })
  }, 4_000)
}

async function startDesktop(): Promise<void> {
  const service = new DashboardService(app.getPath('userData'))
  await service.initialize()
  mainWindow = createMainWindow()
  registerIpcHandlers(mainWindow, service)
  startPolling(service)
  mainWindow.on('closed', () => {
    mainWindow = null
    stopTimers()
  })
}

async function startHelper(): Promise<void> {
  if (!helperOptions) throw new Error('invalid-helper-options')
  const userDataPath = app.getPath('userData')
  const service = new DashboardService(userDataPath)
  await service.initialize()
  helperServer = await startHelperHttpServer({
    service,
    rendererRoot: join(__dirname, '../renderer'),
    token: helperOptions.token,
    port: helperOptions.port,
    dialogs: {
      chooseRoot: async (language) => {
        const result = await dialog.showOpenDialog({
          title:
            language === 'en'
              ? 'Choose Orca Preset Assistant workspace'
              : '选择 Orca 预设助手工作区',
          properties: ['openDirectory'],
        })
        return result.canceled ? null : (result.filePaths[0] ?? null)
      },
      chooseCodexFile: async (language) => {
        const result = await dialog.showOpenDialog({
          title:
            language === 'en'
              ? 'Grant Codex access to one model file'
              : '授权 Codex 读取一个模型文件',
          properties: ['openFile'],
          filters: [{ name: '3D model', extensions: ['stl', '3mf'] }],
        })
        return result.canceled ? null : (result.filePaths[0] ?? null)
      },
      chooseProject3mf: async (language) => {
        const result = await dialog.showOpenDialog({
          title: language === 'en' ? 'Choose the project 3MF to archive' : '选择要归档的项目 3MF',
          properties: ['openFile'],
          filters: [{ name: '3MF project', extensions: ['3mf'] }],
        })
        return result.canceled ? null : (result.filePaths[0] ?? null)
      },
    },
  })
  helperStateFile = helperOptions.stateFile ?? join(userDataPath, HELPER_HTTP_STATE_FILE)
  const webViewUrl = `${helperServer.origin}/#${HELPER_HTTP_SESSION_FRAGMENT}=${encodeURIComponent(
    helperOptions.token,
  )}`
  const state: HelperHttpState = {
    schemaVersion: 1,
    pid: process.pid,
    generatedAt: new Date().toISOString(),
    origin: helperServer.origin,
    port: Number(new URL(helperServer.origin).port),
  }
  await atomicWriteJson(helperStateFile, state)
  process.stdout.write(`${JSON.stringify({ ...state, webViewUrl })}\n`)
  startPolling(service)

  if (helperOptions.parentPid !== null) {
    parentTimer = setInterval(() => {
      try {
        process.kill(helperOptions.parentPid as number, 0)
      } catch {
        app.quit()
      }
    }, 1_000)
  }
}

async function cleanupHelper(): Promise<void> {
  stopTimers()
  const server = helperServer
  helperServer = null
  if (server) await server.close().catch(() => undefined)
  if (helperStateFile) {
    await rm(helperStateFile, { force: true }).catch(() => undefined)
    helperStateFile = null
  }
}

if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app
    .whenReady()
    .then(helperOptions ? startHelper : startDesktop)
    .catch((error: unknown) => {
      console.error(error)
      app.quit()
    })
}

app.on('second-instance', () => {
  if (helperOptions || !mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.focus()
})

app.on('activate', () => {
  if (!helperOptions && BrowserWindow.getAllWindows().length === 0) {
    void startDesktop()
  }
})

app.on('before-quit', () => {
  if (!helperOptions) return
  stopTimers()
  if (helperStateFile) {
    rmSync(helperStateFile, { force: true })
    helperStateFile = null
  }
  void cleanupHelper()
})

app.on('window-all-closed', () => {
  if (!helperOptions) app.quit()
})
