import { describe, expect, it } from 'vitest'

import { latestProposal, proposalDisplayChange } from './proposal-summary'

describe('proposal summary', () => {
  it('shows only the newest proposal in the dashboard slot', () => {
    expect(latestProposal([{ id: 'new' }, { id: 'old' }])).toEqual({ id: 'new' })
    expect(latestProposal([])).toBeNull()
  })

  it('reverses the displayed delta after rollback', () => {
    expect(
      proposalDisplayChange({
        status: 'rolled-back',
        before: { layer_height: '0.18' },
        after: { layer_height: '0.20' },
      }),
    ).toEqual({
      before: { layer_height: '0.20' },
      after: { layer_height: '0.18' },
    })
  })

  it('shows the applied values moving to the current Orca values after a partial rollback', () => {
    expect(
      proposalDisplayChange({
        status: 'partially-rolled-back',
        before: { layer_height: 0.18, support_speed: 30 },
        after: { layer_height: 0.2, support_speed: 20 },
        currentValues: { layer_height: 0.18, support_speed: 20 },
      }),
    ).toEqual({
      before: { layer_height: 0.2, support_speed: 20 },
      after: { layer_height: 0.18, support_speed: 20 },
    })
  })

  it('keeps the requested direction for non-rollback states', () => {
    expect(
      proposalDisplayChange({
        status: 'applied',
        before: { layer_height: '0.18' },
        after: { layer_height: '0.20' },
      }),
    ).toEqual({
      before: { layer_height: '0.18' },
      after: { layer_height: '0.20' },
    })
  })
})
