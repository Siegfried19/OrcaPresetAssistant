import { describe, expect, it } from 'vitest'

import { parsePorcelainStatus } from './git-service'

describe('git porcelain parser', () => {
  it('parses modified and untracked paths without quoting rules', () => {
    const states = parsePorcelainStatus(
      ' M process/quality.json\0?? filament/material with spaces.json\0',
    )

    expect(states.get('process/quality.json')).toBe(' M')
    expect(states.get('filament/material with spaces.json')).toBe('??')
  })

  it('skips the source record after a rename', () => {
    const states = parsePorcelainStatus('R  process/new.json\0process/old.json\0')

    expect(states.get('process/new.json')).toBe('R ')
    expect(states.has('process/old.json')).toBe(false)
  })
})
