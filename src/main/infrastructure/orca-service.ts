import { spawn } from 'node:child_process'
import { constants } from 'node:fs'
import { access } from 'node:fs/promises'
import { join, resolve } from 'node:path'

function candidates(): string[] {
  const paths = new Set<string>()
  const configured = process.env.ORCA_SLICER_EXE
  const programFiles = process.env.ProgramFiles
  const localAppData = process.env.LOCALAPPDATA

  if (configured) paths.add(resolve(configured))
  if (programFiles) {
    paths.add(join(programFiles, 'OrcaSlicer', 'orca-slicer.exe'))
    paths.add(join(programFiles, 'Orca Slicer', 'orca-slicer.exe'))
  }
  if (localAppData) {
    paths.add(join(localAppData, 'Programs', 'OrcaSlicer', 'orca-slicer.exe'))
    paths.add(join(localAppData, 'Programs', 'Orca Slicer', 'orca-slicer.exe'))
  }

  return [...paths]
}

export async function findOrcaExecutable(): Promise<string | null> {
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
