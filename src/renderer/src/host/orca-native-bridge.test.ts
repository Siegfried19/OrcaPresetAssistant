import { describe, expect, it, vi } from 'vitest'

import {
  applyOrcaProposal,
  exportOrcaProjectCopy,
  isOrcaRevisionConflict,
  parseNativeEnvelope,
  readOrcaProject,
  readOrcaSettings,
  resolveOrcaNativeBridge,
  rollbackOrcaProposal,
} from './orca-native-bridge'

describe('Orca native bridge boundary', () => {
  it('recognizes a native revision conflict without matching error text', () => {
    expect(
      isOrcaRevisionConflict(
        Object.assign(new Error('localized message'), { code: 'REVISION_CONFLICT' }),
      ),
    ).toBe(true)
    expect(
      isOrcaRevisionConflict(
        Object.assign(new Error('Native state revision is stale'), { code: 'OTHER' }),
      ),
    ).toBe(false)
  })

  it('accepts only an available versioned bridge surface', () => {
    const request = vi.fn()
    expect(
      resolveOrcaNativeBridge({
        OrcaPresetAssistant: { available: true, revision: 7, request },
      }),
    ).toMatchObject({ available: true, revision: 7, request })
    expect(
      resolveOrcaNativeBridge({
        OrcaPresetAssistant: { available: false, revision: 7, request },
      }),
    ).toBeNull()
    expect(resolveOrcaNativeBridge({})).toBeNull()
  })

  it('rejects malformed native envelopes before data reaches the dashboard', () => {
    expect(() =>
      parseNativeEnvelope({ ok: true }, (value): value is string => typeof value === 'string'),
    ).toThrow('invalid-orca-native-response')
  })

  it('requests proposal.apply and validates the authoritative payload', async () => {
    const request = vi.fn().mockResolvedValue({
      requestId: 'native-1',
      ok: true,
      revision: 12,
      data: {
        authority: 'orca',
        status: 'applied',
        applied: true,
        destination: 'current-project',
        targetPreset: '0.20mm Standard',
        before: { layer_height: '0.20' },
        after: { layer_height: '0.24' },
        rollbackGuard: { id: 'guard-1', validAtRevision: 12 },
      },
    })

    const response = await applyOrcaProposal(
      { available: true, revision: 11, request },
      { destination: 'current-project' },
      9,
    )

    expect(request).toHaveBeenCalledWith(
      'proposal.apply',
      {
        destination: 'current-project',
      },
      { expectedRevision: 9 },
    )
    expect(response.revision).toBe(12)
    expect(response.data.status).toBe('applied')
  })

  it('does not accept a successful envelope without Orca authority', async () => {
    const request = vi.fn().mockResolvedValue({
      requestId: 'native-2',
      ok: true,
      revision: 12,
      data: {
        authority: 'panel',
        status: 'applied',
        applied: true,
        destination: 'current-project',
        targetPreset: '0.20mm Standard',
        before: { layer_height: '0.20' },
        after: { layer_height: '0.24' },
        rollbackGuard: { id: 'guard-1', validAtRevision: 12 },
      },
    })

    await expect(
      applyOrcaProposal({ available: true, revision: 11, request }, {}, 9),
    ).rejects.toThrow('invalid-orca-native-response')
  })

  it('validates authoritative rollback and project export responses', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        requestId: 'rollback-1',
        ok: true,
        revision: 13,
        data: {
          authority: 'orca',
          status: 'rolled-back',
          rolledBack: true,
          destination: 'current-project',
          targetPreset: '0.20mm Standard',
          preservedNewPreset: null,
          before: { layer_height: '0.24' },
          after: { layer_height: '0.20' },
        },
      })
      .mockResolvedValueOnce({
        requestId: 'export-1',
        ok: true,
        revision: 13,
        data: {
          authority: 'orca',
          status: 'exported',
          path: 'C:\\workspace\\PrintHistory\\.native-exports\\archive.3mf',
          currentProjectPathChanged: false,
        },
      })
    const bridge = { available: true as const, revision: 12, request }

    await expect(rollbackOrcaProposal(bridge, 'guard-1', 12)).resolves.toMatchObject({
      revision: 13,
      data: { status: 'rolled-back' },
    })
    await expect(
      exportOrcaProjectCopy(bridge, 'C:\\workspace\\PrintHistory\\.native-exports\\archive.3mf'),
    ).resolves.toMatchObject({ data: { status: 'exported' } })
    expect(request).toHaveBeenNthCalledWith(
      1,
      'proposal.rollback',
      { guardId: 'guard-1' },
      { expectedRevision: 12 },
    )
    expect(request).toHaveBeenNthCalledWith(
      2,
      'project.export-copy',
      {
        authorization: 'project:export-copy',
        destinationPath: 'C:\\workspace\\PrintHistory\\.native-exports\\archive.3mf',
      },
      { expectedRevision: 12 },
    )
  })

  it('requests current-project geometry rather than placement-only data', async () => {
    const request = vi.fn().mockResolvedValue({
      requestId: 'project-1',
      ok: true,
      revision: 14,
      data: {
        authorization: 'project:geometry',
        placement: { objectCount: 1, objects: [] },
        geometryAccessIncluded: true,
        sourcePathsIncluded: true,
      },
    })

    await expect(
      readOrcaProject({ available: true, revision: 14, request }),
    ).resolves.toMatchObject({
      data: { authorization: 'project:geometry', geometryAccessIncluded: true },
    })
    expect(request).toHaveBeenCalledWith('project.get', {
      authorization: 'project:geometry',
    })
  })

  it('reads effective settings without duplicating the state capability catalog', async () => {
    const identity = {
      name: 'Preset',
      isSystem: false,
      isUser: true,
      isDefault: false,
      isExternal: true,
      isProjectEmbedded: false,
      isDirty: false,
      canOverwrite: true,
    }
    const request = vi.fn().mockResolvedValue({
      requestId: 'settings-1',
      ok: true,
      revision: 15,
      data: {
        presets: {
          machine: { ...identity, name: 'Machine', isSystem: true, isUser: false },
          process: { ...identity, name: 'Process' },
          filaments: [{ ...identity, name: 'Filament' }],
        },
        effective: { layer_height: '0.18' },
      },
    })

    await expect(
      readOrcaSettings({ available: true, revision: 15, request }),
    ).resolves.toMatchObject({
      data: { effective: { layer_height: '0.18' } },
    })
    expect(request).toHaveBeenCalledWith('settings.get', { authorization: 'settings:read' })
  })
})
