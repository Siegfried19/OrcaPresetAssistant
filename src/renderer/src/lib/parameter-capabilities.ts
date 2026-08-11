import type {
  OrcaWriteCapabilities,
  OrcaWriteSettingCapability,
  PresetKind,
} from '@shared/contracts'

export function parameterCapability(
  capabilities: OrcaWriteCapabilities | null,
  presetKind: PresetKind,
  key: string,
): OrcaWriteSettingCapability | null {
  return capabilities?.[presetKind].settings.find((setting) => setting.key === key) ?? null
}
