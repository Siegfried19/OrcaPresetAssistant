import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { scanPresets } from './preset-repository'
import {
  createOrcaPrintHistoryBundle,
  createPrintHistoryBundle,
  listPrintHistory,
  parsePrintHistoryRecord,
  parsePrintHistorySettings,
  prepareProject3mfExport,
  resolvePrintHistoryBundlePath,
  updatePrintHistoryRecord,
} from './print-history-store'
import { ensureWorkspaceRoot, workspacePaths } from './discovery'

const temporaryRoots: string[] = []

async function temporaryWorkspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'orca-preset-assistant-'))
  temporaryRoots.push(root)
  await ensureWorkspaceRoot(root)
  return root
}

async function writePreset(
  root: string,
  kind: 'process' | 'filament',
  name: string,
): Promise<void> {
  const directory = join(workspacePaths(root).userPresets, kind)
  const idKey = kind === 'process' ? 'print_settings_id' : 'filament_settings_id'
  const idValue = kind === 'filament' ? [name] : name
  await writeFile(
    join(directory, `${name}.json`),
    `${JSON.stringify({ name, [idKey]: idValue })}\n`,
    'utf8',
  )
  await writeFile(join(directory, `${name}.info`), 'setting_id = test\n', 'utf8')
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  )
})

describe('print history bundles', () => {
  it('creates a manual pending bundle with only record and settings files', async () => {
    const root = await temporaryWorkspace()
    await writePreset(root, 'process', 'Quality')
    await writePreset(root, 'filament', 'Material')
    const presets = await scanPresets(workspacePaths(root).userPresets)
    const processPreset = presets.find((preset) => preset.kind === 'process')
    const filamentPreset = presets.find((preset) => preset.kind === 'filament')
    if (!processPreset || !filamentPreset) throw new Error('fixture presets are missing')

    const created = await createPrintHistoryBundle(
      root,
      processPreset,
      [{ preset: filamentPreset, role: 'model' }],
      'pending',
      'Queued manually',
    )
    const bundlePath = join(root, created.relativePath)

    expect((await readdir(bundlePath)).sort()).toEqual(['record.json', 'settings.json'])
    expect(created.result).toBe('pending')
    expect(created.hasProject3mf).toBe(false)
    expect(created.source).toBe('manual')
    expect(created.captureQuality).toBe('custom-presets-only')
    expect((await listPrintHistory(root)).map((entry) => entry.id)).toEqual([created.id])

    const record = JSON.parse(await readFile(join(bundlePath, 'record.json'), 'utf8')) as unknown
    const settings = JSON.parse(
      await readFile(join(bundlePath, 'settings.json'), 'utf8'),
    ) as unknown
    expect(parsePrintHistoryRecord(record)?.result).toBe('pending')
    expect(parsePrintHistorySettings(settings)?.process?.name).toBe('Quality')
    expect(parsePrintHistorySettings(settings)?.effectiveSettings).toBeNull()
  })

  it('archives an explicitly selected 3MF, keeps effective settings, and only revises record.json', async () => {
    const root = await temporaryWorkspace()
    const archiveId = '12345678-1234-4123-8123-123456789abc'
    const projectPath = await prepareProject3mfExport(root, archiveId)
    await writeFile(projectPath, 'fixture-project', 'utf8')

    const created = await createOrcaPrintHistoryBundle(
      root,
      archiveId,
      {
        authority: 'orca',
        revision: 12,
        effective: { nozzle_diameter: 0.4, layer_height: 0.2, filament_type: 'PLA' },
        selections: {
          machine: presetIdentity('Official Machine', true),
          process: presetIdentity('Official Quality', true),
          filaments: [presetIdentity('Official PLA', true)],
        },
      },
      projectPath,
    )
    const duplicate = await createOrcaPrintHistoryBundle(
      root,
      archiveId,
      {
        authority: 'orca',
        revision: 12,
        effective: { nozzle_diameter: 0.4, layer_height: 0.2, filament_type: 'PLA' },
        selections: {
          machine: presetIdentity('Official Machine', true),
          process: presetIdentity('Official Quality', true),
          filaments: [presetIdentity('Official PLA', true)],
        },
      },
      projectPath,
    )
    expect(duplicate.id).toBe(created.id)
    const bundlePath = join(root, created.relativePath)
    const settingsBefore = await readFile(join(bundlePath, 'settings.json'), 'utf8')

    await updatePrintHistoryRecord(root, {
      id: created.id,
      result: 'success',
      note: 'Completed later',
    })

    expect((await readdir(bundlePath)).sort()).toEqual([
      'project.3mf',
      'record.json',
      'settings.json',
    ])
    expect(await readFile(join(bundlePath, 'project.3mf'), 'utf8')).toBe('fixture-project')
    expect(await readFile(join(bundlePath, 'settings.json'), 'utf8')).toBe(settingsBefore)
    await expect(listPrintHistory(root)).resolves.toMatchObject([
      {
        id: created.id,
        result: 'success',
        note: 'Completed later',
        captureQuality: 'orca-effective',
        source: 'orca-submission',
        machine: { presetId: null, name: 'Official Machine' },
        process: { presetId: null, name: 'Official Quality' },
        materials: [{ presetId: null, name: 'Official PLA', role: 'unspecified' }],
        hasProject3mf: true,
        effectiveSettings: {
          nozzle_diameter: 0.4,
          layer_height: 0.2,
          filament_type: 'PLA',
        },
      },
    ])
    await expect(resolvePrintHistoryBundlePath(root, created.id)).resolves.toBe(bundlePath)
    await expect(resolvePrintHistoryBundlePath(root, '../outside')).rejects.toThrow(
      'print-history-not-found',
    )
  })

  it('ignores malformed bundles and unsafe preset snapshot paths', async () => {
    const root = await temporaryWorkspace()
    const historyRoot = workspacePaths(root).printHistory
    const bundlePath = join(historyRoot, 'run-malformed')
    await mkdir(bundlePath)
    await writeFile(
      join(bundlePath, 'record.json'),
      JSON.stringify({
        schemaVersion: 1,
        id: 'run-malformed',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        source: 'manual',
        captureQuality: 'custom-presets-only',
        result: 'success',
        note: '',
        processPresetId: 'process:outside',
        materials: [],
      }),
      'utf8',
    )
    await writeFile(
      join(bundlePath, 'settings.json'),
      JSON.stringify({
        schemaVersion: 1,
        capturedAt: new Date().toISOString(),
        captureQuality: 'custom-presets-only',
        effectiveSettings: null,
        process: {
          presetId: 'process:outside',
          kind: 'process',
          name: 'Outside',
          path: '../outside.json',
          sha256: 'abc',
          customJson: {},
        },
        materials: [],
      }),
      'utf8',
    )

    expect(await listPrintHistory(root)).toEqual([])
  })
})

function presetIdentity(name: string, isSystem: boolean) {
  return {
    name,
    isSystem,
    isUser: !isSystem,
    isDefault: false,
    isExternal: false,
    isProjectEmbedded: false,
    isDirty: false,
    canOverwrite: !isSystem,
  }
}
