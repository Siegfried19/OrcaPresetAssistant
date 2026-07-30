import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { BrowserWindow, app } from 'electron'

export function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1080,
    minHeight: 700,
    show: false,
    title: 'Orca Preset Assistant',
    backgroundColor: '#f4f5f7',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#00000000',
      symbolColor: '#525866',
      height: 52,
    },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
    },
  })

  window.once('ready-to-show', () => {
    window.show()
  })

  const devServerUrl = process.env.ELECTRON_RENDERER_URL
  const screenshotLanguage = process.env.ORCA_PRESET_ASSISTANT_SCREENSHOT_LANGUAGE
  const query =
    screenshotLanguage === 'zh-CN' || screenshotLanguage === 'en'
      ? { language: screenshotLanguage }
      : undefined
  if (devServerUrl) {
    const url = new URL(devServerUrl)
    if (query) url.searchParams.set('language', query.language)
    void window.loadURL(url.toString())
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'), { query })
  }

  const screenshotPath = process.env.ORCA_PRESET_ASSISTANT_SCREENSHOT
  if (screenshotPath) {
    window.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        void window.webContents.capturePage().then(async (image) => {
          await writeFile(screenshotPath, image.toPNG())
          app.quit()
        })
      }, 1_200)
    })
  }

  return window
}
