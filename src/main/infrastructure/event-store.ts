import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { dirname, join, parse } from 'node:path'
import { createInterface } from 'node:readline'

import { MATERIAL_ROLES } from '@shared/contracts'
import type {
  LatestPrintView,
  MaterialRole,
  PrintResult,
  RecordedMaterialRole,
} from '@shared/contracts'

import type {
  InternalPreset,
  PrintEvent,
  PrintEventV2,
  PrintMaterialSnapshot,
  PrintSnapshot,
} from '../domain/models'

function eventsPath(rootPath: string): string {
  return join(rootPath, 'engineering', 'events.jsonl')
}

async function fileHash(path: string): Promise<string> {
  const hash = createHash('sha256')
  hash.update(await readFile(path))
  return hash.digest('hex')
}

async function createSnapshot(preset: InternalPreset): Promise<PrintSnapshot> {
  return {
    path: preset.relativePath,
    sha256: await fileHash(preset.filePath),
    custom_json: preset.data,
  }
}

function isPrintResult(value: unknown): value is PrintResult {
  return value === 'success' || value === 'issue' || value === 'failed'
}

function isPrintSnapshot(value: unknown): value is PrintSnapshot {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return (
    typeof record.path === 'string' &&
    typeof record.sha256 === 'string' &&
    typeof record.custom_json === 'object' &&
    record.custom_json !== null
  )
}

function isMaterialRole(value: unknown): value is MaterialRole {
  return MATERIAL_ROLES.some((role) => role === value)
}

function isPrintMaterialSnapshot(value: unknown): value is PrintMaterialSnapshot {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return isMaterialRole(record.role) && isPrintSnapshot(record.preset)
}

export function parsePrintEvent(value: unknown): PrintEvent | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  if (
    record.type !== 'print' ||
    typeof record.id !== 'string' ||
    typeof record.printed_at !== 'string' ||
    !isPrintResult(record.result) ||
    typeof record.note !== 'string' ||
    !isPrintSnapshot(record.process)
  ) {
    return null
  }

  if (
    record.schema_version === 1 &&
    Array.isArray(record.filaments) &&
    record.filaments.every(isPrintSnapshot)
  ) {
    return value as PrintEvent
  }

  if (
    record.schema_version === 2 &&
    Array.isArray(record.materials) &&
    record.materials.length > 0 &&
    record.materials.every(isPrintMaterialSnapshot)
  ) {
    return value as PrintEvent
  }

  return null
}

async function readEvents(rootPath: string): Promise<PrintEvent[]> {
  const path = eventsPath(rootPath)
  const events: PrintEvent[] = []
  let stream
  try {
    stream = createReadStream(path, { encoding: 'utf8' })
  } catch {
    return events
  }

  stream.on('error', () => {
    // A missing or temporarily locked event file simply means there is no projection yet.
  })
  const lines = createInterface({ input: stream, crlfDelay: Number.POSITIVE_INFINITY })

  try {
    for await (const line of lines) {
      if (!line.trim()) continue
      try {
        const event = parsePrintEvent(JSON.parse(line))
        if (event) events.push(event)
      } catch {
        // Keep valid evidence readable even if one manually edited line is malformed.
      }
    }
  } catch {
    return events
  }

  return events
}

interface EventMaterial {
  readonly role: RecordedMaterialRole
  readonly preset: PrintSnapshot
}

function eventMaterials(event: PrintEvent): readonly EventMaterial[] {
  if (event.schema_version === 2) return event.materials
  return event.filaments.map((preset) => ({ role: 'unspecified', preset }))
}

function snapshotName(snapshot: PrintSnapshot): string {
  const name = snapshot.custom_json.name
  return typeof name === 'string' && name.trim() ? name : parse(snapshot.path).name
}

async function snapshotIsCurrent(rootPath: string, snapshot: PrintSnapshot): Promise<boolean> {
  try {
    return (await fileHash(join(rootPath, snapshot.path))) === snapshot.sha256
  } catch {
    return false
  }
}

export async function applyLatestPrints(
  rootPath: string,
  presets: InternalPreset[],
): Promise<void> {
  const byPath = new Map(presets.map((preset) => [preset.relativePath, preset]))
  const events = await readEvents(rootPath)

  for (const event of events) {
    const materials = eventMaterials(event)
    const snapshots = [event.process, ...materials.map((material) => material.preset)]
    const currentVersion = (
      await Promise.all(snapshots.map((snapshot) => snapshotIsCurrent(rootPath, snapshot)))
    ).every(Boolean)
    const view: LatestPrintView = {
      eventId: event.id,
      printedAt: event.printed_at,
      result: event.result,
      note: event.note,
      currentVersion,
      materials: materials.map((material) => ({
        name: snapshotName(material.preset),
        role: material.role,
      })),
    }

    for (const snapshot of snapshots) {
      const preset = byPath.get(snapshot.path)
      if (preset) preset.latestPrint = view
    }
  }
}

export async function appendPrintEvent(
  rootPath: string,
  processPreset: InternalPreset,
  materials: readonly {
    readonly preset: InternalPreset
    readonly role: MaterialRole
  }[],
  result: PrintResult,
  note: string,
): Promise<void> {
  const event: PrintEventV2 = {
    schema_version: 2,
    type: 'print',
    id: randomUUID(),
    printed_at: new Date().toISOString(),
    actor: 'user',
    result,
    note: note.trim(),
    process: await createSnapshot(processPreset),
    materials: await Promise.all(
      materials.map(async (material) => ({
        role: material.role,
        preset: await createSnapshot(material.preset),
      })),
    ),
  }

  const path = eventsPath(rootPath)
  await mkdir(dirname(path), { recursive: true })
  await appendFile(path, `${JSON.stringify(event)}\n`, 'utf8')
}
