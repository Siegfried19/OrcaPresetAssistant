import { describe, expect, it } from 'vitest'

import { parameterSnapshotsEqual, parameterValuesEqual } from './parameter-comparison'

describe('Orca parameter comparison', () => {
  it('accepts Orca canonical numeric, percent, and boolean scalars', () => {
    expect(parameterValuesEqual('0.200', 0.2)).toBe(true)
    expect(parameterValuesEqual('50%', 50)).toBe(true)
    expect(parameterValuesEqual('1', true)).toBe(true)
    expect(parameterValuesEqual('0', false)).toBe(true)
  })

  it('treats a repeated Orca vector as the broadcast form of one scalar', () => {
    expect(parameterValuesEqual('20,20', 20)).toBe(true)
    expect(parameterValuesEqual('1,1', true)).toBe(true)
    expect(parameterValuesEqual(['50%', '50%'], 50)).toBe(true)
    expect(
      parameterSnapshotsEqual(
        { support_interface_speed: '20,20', support_interface_loop_pattern: '1' },
        { support_interface_speed: 20, support_interface_loop_pattern: true },
      ),
    ).toBe(true)
  })

  it('rejects vectors whose values do not all match the requested scalar', () => {
    expect(parameterValuesEqual('20,30', 20)).toBe(false)
    expect(parameterValuesEqual('20,20', '20,30')).toBe(false)
    expect(parameterValuesEqual('rectilinear,grid', 'rectilinear')).toBe(false)
  })
})
