import { createHash, randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { PresetFileChangeStore } from './preset-file-change-store'

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  )
})

function hash(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

describe('preset file change store', () => {
  it('moves a logged direct edit from planned to written to Orca-loaded', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orca-preset-file-change-'))
    temporaryRoots.push(root)
    const userData = join(root, 'user-data')
    const userPresets = join(root, 'workspace', 'UserPresets')
    const processRoot = join(userPresets, 'process')
    const inbox = join(userData, 'preset-file-change-inbox')
    await Promise.all([mkdir(processRoot, { recursive: true }), mkdir(inbox, { recursive: true })])

    const presetName = '0.20mm Test_ai_suggestion'
    const relativePath = `process/${presetName}.json`
    const jsonPath = join(processRoot, `${presetName}.json`)
    const infoPath = join(processRoot, `${presetName}.info`)
    const beforeContent = `${JSON.stringify(
      {
        name: presetName,
        print_settings_id: presetName,
        inherits: '0.20mm Standard',
        outer_wall_speed: ['60'],
        top_surface_speed: ['50'],
      },
      null,
      2,
    )}\n`
    await Promise.all([
      writeFile(jsonPath, beforeContent),
      writeFile(infoPath, 'setting_id = \nbase_id = GP001\n'),
    ])

    const id = randomUUID()
    await writeFile(
      join(inbox, `${id}.json`),
      `${JSON.stringify({
        operation: 'update',
        presetKind: 'process',
        presetName,
        relativePath,
        before: { outer_wall_speed: ['60'], top_surface_speed: ['50'] },
        after: { outer_wall_speed: ['55'], top_surface_speed: null },
        removedKeys: ['top_surface_speed'],
        reason: 'Keep the direct file workflow visible in the panel.',
        beforeFileHash: hash(beforeContent),
      })}\n`,
    )

    const store = new PresetFileChangeStore(userData)
    await expect(store.importInbox()).resolves.toEqual({ imported: 1, quarantined: 0 })
    await expect(store.reconcileDisk(userPresets)).resolves.toMatchObject([
      { id, status: 'planned', writtenFileHash: null },
    ])

    const afterContent = `${JSON.stringify(
      {
        name: presetName,
        print_settings_id: presetName,
        inherits: '0.20mm Standard',
        outer_wall_speed: ['55'],
      },
      null,
      2,
    )}\n`
    await writeFile(jsonPath, afterContent)
    const [written] = await store.reconcileDisk(userPresets)
    expect(written).toMatchObject({ id, status: 'written', writtenFileHash: hash(afterContent) })

    await expect(
      store.complete(userPresets, {
        id,
        receipt: {
          authority: 'orca',
          status: 'loaded',
          revision: '19',
          presetKind: 'process',
          presetName,
          relativePath,
          values: { outer_wall_speed: ['55'] },
          absentKeys: ['top_surface_speed'],
        },
      }),
    ).resolves.toMatchObject({ status: 'loaded', authoritativeRevision: '19' })

    const savedDocument = JSON.parse(
      await readFile(join(userData, 'preset-file-changes.json'), 'utf8'),
    )
    expect(savedDocument.changes[0]).toMatchObject({ id, status: 'loaded' })
  })

  it('marks partial or structurally invalid writes as conflicts', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orca-preset-file-change-'))
    temporaryRoots.push(root)
    const userData = join(root, 'user-data')
    const userPresets = join(root, 'workspace', 'UserPresets')
    const filamentRoot = join(userPresets, 'filament')
    const inbox = join(userData, 'preset-file-change-inbox')
    await Promise.all([mkdir(filamentRoot, { recursive: true }), mkdir(inbox, { recursive: true })])
    const presetName = 'Material_ai_suggestion'
    const content = `${JSON.stringify({
      name: presetName,
      filament_settings_id: presetName,
      inherits: 'Generic PLA',
      nozzle_temperature: ['220'],
    })}\n`
    const jsonPath = join(filamentRoot, `${presetName}.json`)
    await Promise.all([
      writeFile(jsonPath, content),
      writeFile(join(filamentRoot, `${presetName}.info`), 'setting_id = \nbase_id = GF001\n'),
    ])
    const id = randomUUID()
    await writeFile(
      join(inbox, `${id}.json`),
      JSON.stringify({
        operation: 'update',
        presetKind: 'filament',
        presetName,
        relativePath: `filament/${presetName}.json`,
        before: { nozzle_temperature: ['220'] },
        after: { nozzle_temperature: ['225'] },
        removedKeys: [],
        reason: 'Test conflict detection.',
        beforeFileHash: hash(content),
      }),
    )
    const store = new PresetFileChangeStore(userData)
    await store.importInbox()
    await writeFile(
      jsonPath,
      JSON.stringify({
        name: 'Wrong identity',
        filament_settings_id: presetName,
        nozzle_temperature: ['225'],
      }),
    )

    await expect(store.reconcileDisk(userPresets)).resolves.toMatchObject([
      { id, status: 'conflict', error: 'preset-file-missing-or-invalid' },
    ])
  })
})
