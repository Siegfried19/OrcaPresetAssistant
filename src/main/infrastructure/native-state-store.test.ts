import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import type { OrcaWriteCapabilities } from '../../shared/contracts'

import { ChangeProposalStore } from './change-proposal-store'
import { NativeStateStore } from './native-state-store'

const roots: string[] = []

const writeCapabilities: OrcaWriteCapabilities = {
  process: {
    access: 'controlled-write',
    settings: [
      {
        key: 'layer_height',
        valueShape: 'scalar',
        kind: 'number',
        minimum: 0.04,
        maximum: null,
        dynamicMaximum: '80-percent-of-smallest-active-nozzle',
        unit: 'mm',
        displayLabel: 'Layer height',
        category: 'Quality',
        editorMode: 'simple',
        panelVisibility: 'visible',
        verification: 'orca-readback',
      },
    ],
  },
  filament: { access: 'controlled-write', settings: [] },
  machine: { access: 'read-only', settings: [] },
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

function selections() {
  const identity = (name: string, isSystem: boolean) => ({
    name,
    isSystem,
    isUser: !isSystem,
    isDefault: false,
    isExternal: false,
    isProjectEmbedded: false,
    isDirty: false,
    canOverwrite: !isSystem,
  })
  return {
    machine: identity('Official Machine', true),
    process: identity('Official Process', true),
    filaments: [identity('Official PLA', true)],
  }
}

describe('native state store', () => {
  it('normalizes native numeric revision and crops data to current-settings permission', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orca-native-state-'))
    roots.push(root)
    const store = new NativeStateStore(root)
    const state = await store.publish('current-settings', {
      revision: 12,
      selections: selections(),
      writeCapabilities,
      settings: { layer_height: '0.2' },
      project: { placement: [{ x: 1, y: 2 }] },
    })

    expect(state).toMatchObject({
      source: 'orca-native',
      revision: '12',
      settings: { layer_height: '0.2' },
    })
    expect('project' in state).toBe(false)
    expect(await store.readFresh()).toEqual(state)

    const proposal = await new ChangeProposalStore(root).queue({
      destination: 'save-as-new-preset',
      presetKind: 'process',
      presetId: 'Official Process',
      newPresetName: 'My Process',
      before: { layer_height: '0.2' },
      after: { layer_height: '0.22' },
      reason: 'Native revision normalization',
      requestedRevision: state.revision,
    })
    expect(proposal.requestedRevision).toBe('12')
  })

  it('writes no full settings or project data at general permission', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orca-native-state-'))
    roots.push(root)
    const store = new NativeStateStore(root)
    await store.publish('general', {
      revision: 7,
      selections: selections(),
      writeCapabilities,
      settings: { layer_height: '0.2' },
      project: { placement: [{ x: 1 }] },
    })
    const saved = JSON.parse(await readFile(join(root, 'native-state.json'), 'utf8')) as Record<
      string,
      unknown
    >
    expect(saved.revision).toBe('7')
    expect(saved.selections).toBeDefined()
    expect(saved.writeCapabilities).toEqual(writeCapabilities)
    expect(saved.settings).toBeUndefined()
    expect(saved.project).toBeUndefined()
  })

  it('keeps project geometry sources only for the current-project session scope', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orca-native-state-'))
    roots.push(root)
    const store = new NativeStateStore(root)
    const project = {
      authorization: 'project:geometry',
      geometryAccessIncluded: true,
      sourcePathsIncluded: true,
      placement: {
        objectCount: 1,
        objects: [
          {
            name: 'bracket',
            sourceFiles: ['C:\\models\\bracket.stl'],
            instances: [],
          },
        ],
      },
    }

    const state = await store.publish('current-project', {
      revision: 13,
      selections: selections(),
      writeCapabilities,
      settings: { layer_height: '0.2' },
      project,
    })

    expect(state.project).toEqual(project)
  })
})
