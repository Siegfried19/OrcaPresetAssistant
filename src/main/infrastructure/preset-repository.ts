import { readdir, readFile, stat } from 'node:fs/promises'
import { basename, extname, join, relative } from 'node:path'

import type { PresetKind, ValidationIssue } from '@shared/contracts'

import type { InternalPreset, JsonRecord } from '../domain/models'
import { createPresetId, readSettingsId, validatePresetIdentity } from '../domain/preset-rules'

const PRESET_KINDS: readonly PresetKind[] = ['process', 'filament', 'machine']

async function listJsonFiles(directory: string): Promise<string[]> {
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch {
    return []
  }

  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) {
        return listJsonFiles(path)
      }
      return entry.isFile() && entry.name.toLowerCase().endsWith('.json') ? [path] : []
    }),
  )

  return nested.flat()
}

function stringValue(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0]
  return ''
}

async function scanFile(
  rootPath: string,
  kind: PresetKind,
  filePath: string,
): Promise<InternalPreset> {
  const filenameStem = basename(filePath, extname(filePath))
  const infoPath = filePath.slice(0, -extname(filePath).length) + '.info'
  const relativePath = relative(rootPath, filePath).replaceAll('\\', '/')
  const relativeInfoPath = relative(rootPath, infoPath).replaceAll('\\', '/')
  let data: JsonRecord = {}
  let parseIssue: ValidationIssue | null = null

  try {
    const parsed: unknown = JSON.parse(await readFile(filePath, 'utf8'))
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      parseIssue = 'json-root-not-object'
    } else {
      data = parsed as JsonRecord
    }
  } catch {
    parseIssue = 'json-parse-failed'
  }

  const hasInfoFile = await stat(infoPath)
    .then((infoStat) => infoStat.isFile())
    .catch(() => false)

  const validationIssues = [
    ...(parseIssue ? [parseIssue] : []),
    ...validatePresetIdentity(kind, filenameStem, data, hasInfoFile),
  ]
  const fileStat = await stat(filePath)

  return {
    id: createPresetId(kind, relativePath),
    rootPath,
    filePath,
    infoPath: hasInfoFile ? infoPath : null,
    relativePath,
    relativeInfoPath: hasInfoFile ? relativeInfoPath : null,
    kind,
    name: stringValue(data.name) || filenameStem,
    inherits: stringValue(data.inherits),
    settingsId: readSettingsId(kind, data),
    modifiedAt: fileStat.mtime.toISOString(),
    data,
    validationIssues,
    gitState: 'unknown',
    diffStats: null,
    latestPrint: null,
  }
}

export async function scanPresets(rootPath: string): Promise<InternalPreset[]> {
  const groups = await Promise.all(
    PRESET_KINDS.map(async (kind) => {
      const files = await listJsonFiles(join(rootPath, kind))
      return Promise.all(files.map((filePath) => scanFile(rootPath, kind, filePath)))
    }),
  )

  return groups
    .flat()
    .sort(
      (left, right) => left.kind.localeCompare(right.kind) || left.name.localeCompare(right.name),
    )
}
