import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { ChangeProposalStore } from './change-proposal-store'

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  )
})

describe('change proposal store', () => {
  it('queues pending work without claiming Orca applied it', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orca-proposals-'))
    temporaryRoots.push(root)
    const store = new ChangeProposalStore(root)
    const proposal = await store.queue({
      destination: 'current-project',
      presetKind: 'process',
      presetId: 'process:quality',
      before: { layer_height: 0.2 },
      after: { layer_height: 0.22 },
      reason: 'Test one explicit change',
      requestedRevision: 'revision-1',
    })

    expect(proposal.status).toBe('pending')
    expect(proposal.approvedAt).toBeNull()
    expect(proposal.authoritativeRevision).toBeNull()
  })

  it('requires an Orca receipt and guards rollback against later changes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orca-proposals-'))
    temporaryRoots.push(root)
    const store = new ChangeProposalStore(root)
    const proposal = await store.queue({
      destination: 'update-current-preset',
      presetKind: 'process',
      presetId: 'process:quality',
      before: { layer_height: 0.2 },
      after: { layer_height: 0.22 },
      reason: 'Verified improvement',
      requestedRevision: 'revision-1',
    })
    await expect(
      store.complete({
        id: proposal.id,
        receipt: {
          authority: 'orca',
          status: 'applied',
          revision: 'revision-2',
          before: proposal.before,
          after: proposal.after,
        },
      }),
    ).rejects.toThrow('invalid-authoritative-receipt')
    const approved = await store.approve({
      id: proposal.id,
      destination: 'save-as-new-preset',
      newPresetName: 'Quality verified',
    })

    expect(approved.approvedAt).toEqual(expect.any(String))
    expect(approved.destination).toBe('save-as-new-preset')
    expect(approved.newPresetName).toBe('Quality verified')
    await expect(
      store.complete({
        id: proposal.id,
        receipt: {
          authority: 'orca',
          status: 'applied',
          revision: 'revision-2',
          before: proposal.before,
          after: proposal.after,
          rollbackGuard: { id: 'guard-1', validAtRevision: 'revision-2' },
        },
      }),
    ).resolves.toMatchObject({
      status: 'applied',
      authoritativeRevision: 'revision-2',
      rollbackGuard: { id: 'guard-1', validAtRevision: 'revision-2' },
    })

    await expect(
      store.guardRollback({
        id: proposal.id,
        currentRevision: 'revision-2',
        currentValues: { layer_height: 0.24 },
      }),
    ).resolves.toEqual({ allowed: false, reason: 'values-changed', changes: null })

    await expect(
      store.guardRollback({
        id: proposal.id,
        currentRevision: 'revision-2',
        currentValues: { layer_height: 0.22 },
      }),
    ).resolves.toEqual({
      allowed: true,
      reason: null,
      changes: { layer_height: 0.2 },
    })

    await expect(
      store.complete({
        id: proposal.id,
        receipt: {
          authority: 'orca',
          status: 'rolled-back',
          revision: 'revision-3',
          before: proposal.before,
          after: proposal.after,
        },
      }),
    ).resolves.toMatchObject({
      status: 'rolled-back',
      authoritativeRevision: 'revision-3',
      rollbackGuard: null,
    })
  })

  it('accepts Orca canonical scalar values and enriches a recovered receipt idempotently', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orca-proposals-'))
    temporaryRoots.push(root)
    const store = new ChangeProposalStore(root)
    const proposal = await store.queue({
      destination: 'update-current-preset',
      presetKind: 'process',
      presetId: 'process:quality',
      before: { layer_height: '0.18', detect_thin_wall: false },
      after: { layer_height: '0.20', detect_thin_wall: true },
      reason: 'Use an Orca-canonical numeric and boolean receipt',
      requestedRevision: 'revision-1',
    })
    await store.approve({ id: proposal.id, destination: 'update-current-preset' })

    await expect(
      store.complete({
        id: proposal.id,
        receipt: {
          authority: 'orca',
          status: 'applied',
          revision: 'revision-2',
          before: { layer_height: '0.180', detect_thin_wall: '0' },
          after: { layer_height: '0.2', detect_thin_wall: '1' },
        },
      }),
    ).resolves.toMatchObject({ status: 'applied', rollbackGuard: null })

    await expect(
      store.complete({
        id: proposal.id,
        receipt: {
          authority: 'orca',
          status: 'applied',
          revision: 'revision-2',
          before: { layer_height: '0.18', detect_thin_wall: false },
          after: { layer_height: '0.20', detect_thin_wall: true },
          rollbackGuard: { id: 'guard-2', validAtRevision: 'revision-2' },
        },
      }),
    ).resolves.toMatchObject({
      status: 'applied',
      rollbackGuard: { id: 'guard-2', validAtRevision: 'revision-2' },
    })

    await expect(
      store.guardRollback({
        id: proposal.id,
        currentRevision: 'revision-2',
        currentValues: { layer_height: '0.200', detect_thin_wall: '1' },
      }),
    ).resolves.toEqual({
      allowed: true,
      reason: null,
      changes: { layer_height: '0.18', detect_thin_wall: false },
    })
  })

  it('filters persisted records that do not satisfy the complete proposal schema', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orca-proposals-'))
    temporaryRoots.push(root)
    await writeFile(
      join(root, 'change-proposals.json'),
      JSON.stringify({
        schemaVersion: 1,
        proposals: [
          {
            id: 'tampered',
            createdAt: 'not-a-date',
            updatedAt: 'not-a-date',
            approvedAt: null,
            destination: 'current-project',
            presetKind: 'process',
            presetId: 'process:quality',
            newPresetName: null,
            before: { layer_height: 0.2 },
            after: { layer_height: 0.22 },
            reason: 'Tampered record',
            status: 'applied',
            requestedRevision: 'revision-1',
            authoritativeRevision: null,
            error: null,
          },
        ],
      }),
      'utf8',
    )

    await expect(new ChangeProposalStore(root).list()).resolves.toEqual([])
  })

  it('imports valid MCP requests as unapproved pending proposals and quarantines invalid files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orca-proposals-'))
    temporaryRoots.push(root)
    const inbox = join(root, 'mcp-inbox')
    const store = new ChangeProposalStore(root)
    await store.importInbox(() => true)
    const validId = '12345678-1234-4123-8123-123456789abc'
    await writeFile(
      join(inbox, `${validId}.json`),
      JSON.stringify({
        destination: 'current-project',
        presetKind: 'process',
        presetId: 'process:quality',
        before: { layer_height: 0.2 },
        after: { layer_height: 0.22 },
        reason: 'MCP proposal',
        requestedRevision: 'revision-1',
      }),
      'utf8',
    )
    await writeFile(join(inbox, 'invalid.json'), '{}', 'utf8')

    await expect(
      store.importInbox(
        (request) => request.presetId === 'process:quality' && request.presetKind === 'process',
      ),
    ).resolves.toEqual({ imported: 1, quarantined: 1 })
    await expect(store.list()).resolves.toMatchObject([
      {
        id: validId,
        status: 'pending',
        approvedAt: null,
        authoritativeRevision: null,
      },
    ])
    expect(await readdir(join(inbox, 'quarantine'))).toHaveLength(1)
    expect(await readdir(inbox)).toEqual(['quarantine'])
  })

  it('quarantines a validly shaped MCP request when the dashboard rejects its preset target', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orca-proposals-'))
    temporaryRoots.push(root)
    const inbox = join(root, 'mcp-inbox')
    const store = new ChangeProposalStore(root)
    await store.importInbox(() => true)
    await writeFile(
      join(inbox, '87654321-4321-4321-8321-cba987654321.json'),
      JSON.stringify({
        destination: 'update-current-preset',
        presetKind: 'process',
        presetId: 'process:missing',
        before: { layer_height: 0.2 },
        after: { layer_height: 0.22 },
        reason: 'Missing preset',
        requestedRevision: 'revision-1',
      }),
      'utf8',
    )

    await expect(store.importInbox(() => false)).resolves.toEqual({
      imported: 0,
      quarantined: 1,
    })
    await expect(store.list()).resolves.toEqual([])
  })
})
