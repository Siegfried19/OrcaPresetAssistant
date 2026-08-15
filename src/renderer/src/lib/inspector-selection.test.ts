import { describe, expect, it } from 'vitest'

import type { ChangeProposalView } from '@shared/contracts'

import { proposalTargetName, resolveInspectorSelection } from './inspector-selection'

function proposal(overrides: Partial<ChangeProposalView> = {}): ChangeProposalView {
  return {
    id: 'proposal-1',
    createdAt: '2026-08-12T16:52:57.249Z',
    updatedAt: '2026-08-12T16:52:57.249Z',
    approvedAt: null,
    destination: 'save-as-new-preset',
    presetKind: 'process',
    presetId: 'orca:process:0.20mm Standard @BBL X1C',
    newPresetName: 'PLA-CF process',
    before: { wall_loops: '2' },
    after: { wall_loops: '3' },
    currentValues: null,
    reason: 'Create a user process from the selected official process.',
    status: 'pending',
    requestedRevision: '12',
    authoritativeRevision: null,
    rollbackGuard: null,
    error: null,
    ...overrides,
  }
}

describe('inspector selection', () => {
  it('opens a proposal for an official preset without requiring a user-preset row', () => {
    const officialProposal = proposal()

    expect(resolveInspectorSelection([], [officialProposal], null, officialProposal.id)).toEqual({
      preset: null,
      proposal: officialProposal,
      proposalTargetName: '0.20mm Standard @BBL X1C',
    })
  })

  it('keeps normal user-preset selection and proposal priority unchanged', () => {
    const presets = [{ id: 'process:quality.json', name: 'Quality' }]
    const applied = proposal({
      id: 'applied',
      destination: 'update-current-preset',
      presetId: presets[0]!.id,
      newPresetName: null,
      status: 'applied',
      approvedAt: '2026-08-12T16:53:00.000Z',
      authoritativeRevision: '13',
    })
    const pending = proposal({
      id: 'pending',
      destination: 'update-current-preset',
      presetId: presets[0]!.id,
      newPresetName: null,
    })

    expect(resolveInspectorSelection(presets, [applied, pending], presets[0]!.id, null)).toEqual({
      preset: presets[0],
      proposal: pending,
      proposalTargetName: 'Quality',
    })
  })

  it('falls back to the raw id for an unknown non-native target', () => {
    expect(proposalTargetName(proposal({ presetId: 'missing-process' }), [])).toBe(
      'missing-process',
    )
  })
})
