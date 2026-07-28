import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline'

import type { LatestPrintView, PrintResult } from '@shared/contracts'

import type { InternalPreset, PrintEvent, PrintSnapshot } from '../domain/models'

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

function parseEvent(value: unknown): PrintEvent | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  if (
    record.schema_version !== 1 ||
    record.type !== 'print' ||
    typeof record.id !== 'string' ||
    typeof record.printed_at !== 'string' ||
    !isPrintResult(record.result) ||
    typeof record.note !== 'string' ||
    !isPrintSnapshot(record.process) ||
    !Array.isArray(record.filaments) ||
    !record.filaments.every(isPrintSnapshot)
  ) {
    return null
  }

  return value as PrintEvent
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
        const event = parseEvent(JSON.parse(line))
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
    const snapshots = [event.process, ...event.filaments]
    const currentVersion = (
      await Promise.all(snapshots.map((snapshot) => snapshotIsCurrent(rootPath, snapshot)))
    ).every(Boolean)
    const view: LatestPrintView = {
      eventId: event.id,
      printedAt: event.printed_at,
      result: event.result,
      note: event.note,
      currentVersion,
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
  filamentPresets: readonly InternalPreset[],
  result: PrintResult,
  note: string,
): Promise<void> {
  const event: PrintEvent = {
    schema_version: 1,
    type: 'print',
    id: randomUUID(),
    printed_at: new Date().toISOString(),
    actor: 'user',
    result,
    note: note.trim(),
    process: await createSnapshot(processPreset),
    filaments: await Promise.all(filamentPresets.map(createSnapshot)),
  }

  const path = eventsPath(rootPath)
  await mkdir(dirname(path), { recursive: true })
  await appendFile(path, `${JSON.stringify(event)}\n`, 'utf8')
}
