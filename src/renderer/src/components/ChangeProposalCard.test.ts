import { describe, expect, it } from 'vitest'

import type { ChangeProposalView } from '@shared/contracts'

import { proposalApprovalRequest } from './ChangeProposalCard'

function proposal(
  destination: ChangeProposalView['destination'],
  newPresetName: string | null,
): ChangeProposalView {
  return {
    id: 'proposal-1',
    createdAt: '2026-08-15T00:00:00.000Z',
    updatedAt: '2026-08-15T00:00:00.000Z',
    approvedAt: null,
    destination,
    presetKind: 'process',
    presetId: 'orca:process:Quality',
    newPresetName,
    before: { layer_height: '0.2' },
    after: { layer_height: '0.16' },
    reason: 'Improve detail.',
    status: 'pending',
    requestedRevision: '1',
    authoritativeRevision: null,
    rollbackGuard: null,
    error: null,
  }
}

describe('proposal approval request', () => {
  it('preserves the destination and new name stored on a save-as-new proposal', () => {
    expect(proposalApprovalRequest(proposal('save-as-new-preset', 'Quality detail'))).toEqual({
      id: 'proposal-1',
      destination: 'save-as-new-preset',
      newPresetName: 'Quality detail',
    })
  })

  it('does not attach an unrelated saved name to another destination', () => {
    expect(proposalApprovalRequest(proposal('update-current-preset', 'stale name'))).toEqual({
      id: 'proposal-1',
      destination: 'update-current-preset',
    })
  })
})
