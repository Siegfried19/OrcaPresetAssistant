import { access } from 'node:fs/promises'
import { constants } from 'node:fs'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

function candidates(): string[] {
  const paths = new Set<string>()
  const programFiles = process.env.ProgramFiles
  const localAppData = process.env.LOCALAPPDATA

  if (programFiles) {
    paths.add(join(programFiles, 'Bambu Studio', 'bambu-studio.exe'))
  }
  if (localAppData) {
    paths.add(join(localAppData, 'Programs', 'Bambu Studio', 'bambu-studio.exe'))
  }

  for (let code = 'C'.charCodeAt(0); code <= 'Z'.charCodeAt(0); code += 1) {
    paths.add(`${String.fromCharCode(code)}:\\Bambu studio\\bambu-studio.exe`)
    paths.add(`${String.fromCharCode(code)}:\\Bambu Studio\\bambu-studio.exe`)
  }

  return [...paths]
}

export async function findBambuExecutable(): Promise<string | null> {
  for (const path of candidates()) {
    try {
      await access(path, constants.X_OK)
      return path
    } catch {
      // Continue with the next known installation location.
    }
  }
  return null
}

export function launchDetached(executable: string): void {
  const child = spawn(executable, [], {
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  })
  child.unref()
}
