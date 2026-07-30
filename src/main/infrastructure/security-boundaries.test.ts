import { describe, expect, it } from 'vitest'

import { IPC_CHANNELS } from '@shared/contracts'

describe('renderer authority boundaries', () => {
  it('does not expose authoritative Orca completion through IPC', () => {
    expect('completeChangeProposal' in IPC_CHANNELS).toBe(false)
    expect(IPC_CHANNELS.approveChangeProposal).toBe('dashboard:approve-change-proposal')
  })

  it('only exposes a manual record channel, not an Orca-authoritative archive channel', () => {
    expect(IPC_CHANNELS.recordPrint).toBe('dashboard:record-print')
    expect(
      Object.values(IPC_CHANNELS).some((channel) => channel.includes('orca-print-archive')),
    ).toBe(false)
  })
})
