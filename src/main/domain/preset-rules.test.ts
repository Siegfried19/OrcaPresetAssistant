import { describe, expect, it } from 'vitest'

import { createPresetId, readSettingsId, validatePresetIdentity } from './preset-rules'

describe('preset identity rules', () => {
  it('reads the first filament settings id', () => {
    expect(readSettingsId('filament', { filament_settings_id: ['PAHT custom'] })).toBe(
      'PAHT custom',
    )
  })

  it('accepts a registered process preset', () => {
    const messages = validatePresetIdentity(
      'process',
      '0.18mm Balanced',
      {
        name: '0.18mm Balanced',
        print_settings_id: '0.18mm Balanced',
      },
      true,
    )

    expect(messages).toEqual([])
  })

  it('reports structural mismatches independently', () => {
    const messages = validatePresetIdentity(
      'filament',
      'Expected name',
      {
        name: 'Other name',
        filament_settings_id: ['Other id'],
      },
      false,
    )

    expect(messages).toEqual([
      'filename-name-mismatch',
      'settings-id-filename-mismatch',
      'missing-info',
    ])
  })

  it('creates stable ids with forward slashes', () => {
    expect(createPresetId('process', 'process\\sample.json')).toBe('process:process/sample.json')
  })
})
