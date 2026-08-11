import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { shell } from 'electron'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ensureWorkspaceRoot } from '../infrastructure/discovery'
import {
  createOrcaPrintHistoryBundle,
  listPrintHistory,
} from '../infrastructure/print-history-store'
import { DashboardService } from './dashboard-service'

vi.mock('electron', () => ({
  shell: {
    openPath: vi.fn(async () => ''),
    trashItem: vi.fn(),
  },
}))

const roots: string[] = []

afterEach(async () => {
  vi.useRealTimers()
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

function identity(name: string, isSystem: boolean) {
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

describe('DashboardService native proposal targets', () => {
  it('labels presets by Orca identity metadata without treating local JSON as invalid', async () => {
    const userData = await mkdtemp(join(tmpdir(), 'orca-service-userdata-'))
    const workspace = await mkdtemp(join(tmpdir(), 'orca-service-workspace-'))
    roots.push(userData, workspace)
    const paths = await ensureWorkspaceRoot(workspace)
    const name = 'Local Process'
    const presetPath = join(paths.userPresets, 'process', `${name}.json`)
    await writeFile(
      presetPath,
      `${JSON.stringify({ name, print_settings_id: name, inherits: '0.20mm Standard' })}\n`,
      'utf8',
    )

    const service = new DashboardService(userData)
    await service.initialize()
    const localSnapshot = await service.setRoot(workspace)
    expect(localSnapshot.presets).toContainEqual(
      expect.objectContaining({
        name,
        origin: 'local-json',
        validationIssues: [],
      }),
    )

    await writeFile(
      join(paths.userPresets, 'process', `${name}.info`),
      'setting_id = test\n',
      'utf8',
    )
    const managedSnapshot = (await service.refresh()).snapshot
    expect(managedSnapshot.presets).toContainEqual(
      expect.objectContaining({ name, origin: 'orca-managed' }),
    )
  })

  it('moves only the selected validated print-history bundle to the recycle bin', async () => {
    const userData = await mkdtemp(join(tmpdir(), 'orca-service-userdata-'))
    const workspace = await mkdtemp(join(tmpdir(), 'orca-service-workspace-'))
    roots.push(userData, workspace)
    await ensureWorkspaceRoot(workspace)
    const archived = await createOrcaPrintHistoryBundle(
      workspace,
      '12345678-1234-4123-8123-123456789abc',
      {
        authority: 'orca',
        revision: 12,
        effective: { layer_height: 0.2 },
        selections: {
          machine: identity('Machine', true),
          process: identity('Process', true),
          filaments: [identity('PLA', true)],
        },
      },
    )
    vi.mocked(shell.trashItem).mockImplementationOnce(async (path) => {
      await rm(path, { recursive: true })
    })

    const service = new DashboardService(userData)
    await service.initialize()
    await service.setRoot(workspace)
    const snapshot = await service.deletePrintHistory(archived.id)

    expect(shell.trashItem).toHaveBeenCalledWith(join(workspace, archived.relativePath))
    expect(snapshot.printHistory).toEqual([])
    await expect(listPrintHistory(workspace)).resolves.toEqual([])
  })

  it('requires explicit consent before preparing an automatic 3MF export in ask mode', async () => {
    const userData = await mkdtemp(join(tmpdir(), 'orca-service-userdata-'))
    const workspace = await mkdtemp(join(tmpdir(), 'orca-service-workspace-'))
    roots.push(userData, workspace)
    await ensureWorkspaceRoot(workspace)
    const service = new DashboardService(userData)
    await service.initialize()
    await service.setRoot(workspace)
    await service.updateSettings({ autoArchive: true, threeMfPolicy: 'ask' })
    const archiveId = '12345678-1234-4123-8123-123456789abc'

    await expect(service.prepareProjectExport(archiveId)).resolves.toEqual({
      status: 'skipped',
      destinationPath: null,
      reason: 'explicit-selection-required',
    })
    await expect(service.prepareProjectExport(archiveId, true)).resolves.toMatchObject({
      status: 'ready',
      destinationPath: expect.stringMatching(/123456789abc\.3mf$/u),
      reason: null,
    })
  })

  it('allows save-as-new from the fresh selected official preset but never updates it', async () => {
    const userData = await mkdtemp(join(tmpdir(), 'orca-service-userdata-'))
    const workspace = await mkdtemp(join(tmpdir(), 'orca-service-workspace-'))
    roots.push(userData, workspace)
    await ensureWorkspaceRoot(workspace)
    const service = new DashboardService(userData)
    await service.initialize()
    await service.setRoot(workspace)
    await service.setCodexScope('current-settings')
    await service.publishNativeState({
      revision: 12,
      selections: {
        machine: identity('Official Machine', true),
        process: identity('Official Process', true),
        filaments: [identity('Official PLA', true)],
      },
      settings: { layer_height: '0.2' },
    })

    const proposal = await service.queueChangeProposal({
      destination: 'save-as-new-preset',
      presetKind: 'process',
      presetId: 'Official Process',
      newPresetName: 'My Process',
      before: { layer_height: '0.2' },
      after: { layer_height: '0.22' },
      reason: 'Create a user preset from the active official preset',
      requestedRevision: '12',
    })
    await service.approveChangeProposal({
      id: proposal.id,
      destination: 'save-as-new-preset',
      newPresetName: 'My Process',
    })
    await expect(
      service.completeChangeProposal({
        id: proposal.id,
        receipt: {
          authority: 'orca',
          status: 'applied',
          revision: String(13),
          before: proposal.before,
          after: proposal.after,
        },
      }),
    ).resolves.toMatchObject({ status: 'applied', authoritativeRevision: '13' })

    await expect(
      service.queueChangeProposal({
        destination: 'update-current-preset',
        presetKind: 'process',
        presetId: 'Official Process',
        before: { layer_height: '0.2' },
        after: { layer_height: '0.22' },
        reason: 'Must be rejected',
        requestedRevision: '12',
      }),
    ).rejects.toThrow('invalid-change-proposal')
  })

  it('recovers an approved proposal when a newer authoritative Orca state has its values', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-10T12:00:00.000Z'))
    const userData = await mkdtemp(join(tmpdir(), 'orca-service-userdata-'))
    const workspace = await mkdtemp(join(tmpdir(), 'orca-service-workspace-'))
    roots.push(userData, workspace)
    const paths = await ensureWorkspaceRoot(workspace)
    const name = 'Recoverable Process'
    await writeFile(
      join(paths.userPresets, 'process', `${name}.json`),
      `${JSON.stringify({ name, print_settings_id: name, inherits: '0.20mm Standard' })}\n`,
      'utf8',
    )

    const service = new DashboardService(userData)
    await service.initialize()
    const snapshot = await service.setRoot(workspace)
    await service.setCodexScope('current-settings')
    const preset = snapshot.presets.find((candidate) => candidate.name === name)
    expect(preset).toBeDefined()
    await service.publishNativeState({
      revision: 12,
      selections: {
        machine: identity('Machine', true),
        process: identity(name, false),
        filaments: [identity('PLA', true)],
      },
      settings: { layer_height: '0.18' },
    })
    const proposal = await service.queueChangeProposal({
      destination: 'update-current-preset',
      presetKind: 'process',
      presetId: preset!.id,
      before: { layer_height: '0.18' },
      after: { layer_height: '0.20' },
      reason: 'Recover an authoritative result after receipt persistence was interrupted',
      requestedRevision: '12',
    })
    await service.approveChangeProposal({
      id: proposal.id,
      destination: 'update-current-preset',
    })
    vi.advanceTimersByTime(11_000)

    await service.publishNativeState({
      revision: 13,
      selections: {
        machine: identity('Machine', true),
        process: identity(name, false),
        filaments: [identity('PLA', true)],
      },
      settings: { layer_height: '0.2' },
    })

    await expect(service.listChangeProposals()).resolves.toContainEqual(
      expect.objectContaining({
        id: proposal.id,
        status: 'applied',
        authoritativeRevision: '13',
      }),
    )
  })

  it('fails an orphaned approval instead of leaving invalid approve and reject actions visible', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-10T12:00:00.000Z'))
    const userData = await mkdtemp(join(tmpdir(), 'orca-service-userdata-'))
    const workspace = await mkdtemp(join(tmpdir(), 'orca-service-workspace-'))
    roots.push(userData, workspace)
    const paths = await ensureWorkspaceRoot(workspace)
    const name = 'Orphaned Process'
    await writeFile(
      join(paths.userPresets, 'process', `${name}.json`),
      `${JSON.stringify({ name, print_settings_id: name, inherits: '0.20mm Standard' })}\n`,
      'utf8',
    )

    const service = new DashboardService(userData)
    await service.initialize()
    const snapshot = await service.setRoot(workspace)
    await service.setCodexScope('current-settings')
    const preset = snapshot.presets.find((candidate) => candidate.name === name)
    expect(preset).toBeDefined()
    const proposal = await service.queueChangeProposal({
      destination: 'current-project',
      presetKind: 'process',
      presetId: preset!.id,
      before: { layer_height: '0.18' },
      after: { layer_height: '0.20' },
      reason: 'Stop waiting when the approved result is absent from a later Orca state',
      requestedRevision: '12',
    })
    await service.approveChangeProposal({ id: proposal.id, destination: 'current-project' })
    vi.advanceTimersByTime(11_000)

    await service.publishNativeState({
      revision: 1,
      selections: {
        machine: identity('Machine', true),
        process: identity(name, false),
        filaments: [identity('PLA', true)],
      },
      settings: { layer_height: '0.18' },
    })

    await expect(service.listChangeProposals()).resolves.toContainEqual(
      expect.objectContaining({
        id: proposal.id,
        status: 'failed',
        authoritativeRevision: '1',
        error: "The approved change is not present in Orca's current settings.",
      }),
    )
  })
})
