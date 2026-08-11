import type { ChangeProposalView, ParameterSnapshot } from '@shared/contracts'

type ProposalChange = Pick<ChangeProposalView, 'status' | 'before' | 'after' | 'currentValues'>

export function latestProposal<T>(proposals: readonly T[]): T | null {
  return proposals[0] ?? null
}

export function proposalDisplayChange(proposal: ProposalChange): {
  readonly before: ParameterSnapshot
  readonly after: ParameterSnapshot
} {
  if (proposal.status === 'rolled-back') {
    return { before: proposal.after, after: proposal.currentValues ?? proposal.before }
  }
  if (
    (proposal.status === 'partially-rolled-back' || proposal.status === 'changed-after-apply') &&
    proposal.currentValues
  ) {
    return { before: proposal.after, after: proposal.currentValues }
  }
  return { before: proposal.before, after: proposal.after }
}
