import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import type { AppConfig } from '../domain/models'

const EMPTY_CONFIG: AppConfig = { schemaVersion: 1 }

export class ConfigStore {
  private readonly filePath: string

  public constructor(userDataPath: string) {
    this.filePath = join(userDataPath, 'config.json')
  }

  public async read(): Promise<AppConfig> {
    try {
      const raw = await readFile(this.filePath, 'utf8')
      const parsed: unknown = JSON.parse(raw)
      if (!isConfig(parsed)) {
        return EMPTY_CONFIG
      }
      return parsed
    } catch {
      return EMPTY_CONFIG
    }
  }

  public async savePresetRoot(presetRoot: string): Promise<void> {
    const config: AppConfig = {
      schemaVersion: 1,
      presetRoot,
    }
    await mkdir(dirname(this.filePath), { recursive: true })
    await writeFile(this.filePath, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
  }
}

function isConfig(value: unknown): value is AppConfig {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const record = value as Record<string, unknown>
  return (
    record.schemaVersion === 1 &&
    (record.presetRoot === undefined || typeof record.presetRoot === 'string')
  )
}
