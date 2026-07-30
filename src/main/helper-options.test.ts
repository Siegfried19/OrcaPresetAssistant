import { describe, expect, it } from 'vitest'

import { parseHelperOptions } from './helper-options'

describe('helper CLI options', () => {
  it('uses explicit serve options', () => {
    expect(
      parseHelperOptions(
        [
          'electron.exe',
          '.',
          '--serve',
          '--host',
          '127.0.0.1',
          '--port',
          '0',
          '--session-token',
          '12345678901234567890123456789012',
          '--state-file',
          'C:\\temp\\helper.json',
          '--parent-pid',
          '42',
        ],
        {},
      ),
    ).toEqual({
      port: 0,
      token: '12345678901234567890123456789012',
      stateFile: 'C:\\temp\\helper.json',
      parentPid: 42,
    })
  })

  it('does not enable helper mode without --serve', () => {
    expect(parseHelperOptions(['electron.exe', '.'], {})).toBeNull()
  })
})
