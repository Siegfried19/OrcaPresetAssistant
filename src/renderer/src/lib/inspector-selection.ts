import type { ChangeProposalView } from '@shared/contracts'

interface PresetIdentity {
  readonly id: string
  readonly name: string
}

export interface InspectorSelection<TPreset extends PresetIdentity> {
  readonly preset: TPreset | null
  readonly proposal: ChangeProposalView | null
  readonly proposalTargetName: string | null
}

function preferredProposal(proposals: readonly ChangeProposalView[]): ChangeProposalView | null {
  return (
    proposals.find((proposal) => proposal.status === 'pending' && proposal.approvedAt === null) ??
    proposals.find((proposal) => proposal.status === 'pending') ??
    proposals[0] ??
    null
  )
}

export function proposalTargetName(
  proposal: ChangeProposalView,
  presets: readonly PresetIdentity[],
): string {
  const localPreset = presets.find((preset) => preset.id === proposal.presetId)
  if (localPreset) return localPreset.name

  const nativePrefix = `orca:${proposal.presetKind}:`
  return proposal.presetId.startsWith(nativePrefix)
    ? proposal.presetId.slice(nativePrefix.length)
    : proposal.presetId
}

export function resolveInspectorSelection<TPreset extends PresetIdentity>(
  presets: readonly TPreset[],
  proposals: readonly ChangeProposalView[],
  selectedPresetId: string | null,
  selectedProposalId: string | null,
): InspectorSelection<TPreset> {
  const explicitProposal = selectedProposalId
    ? (proposals.find((proposal) => proposal.id === selectedProposalId) ?? null)
    : null
  const effectivePresetId = explicitProposal?.presetId ?? selectedPresetId
  const preset = effectivePresetId
    ? (presets.find((candidate) => candidate.id === effectivePresetId) ?? null)
    : null
  const proposal =
    explicitProposal ??
    (preset
      ? preferredProposal(proposals.filter((candidate) => candidate.presetId === preset.id))
      : null)

  return {
    preset,
    proposal,
    proposalTargetName: proposal ? proposalTargetName(proposal, presets) : null,
  }
}
