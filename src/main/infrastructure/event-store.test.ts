import { describe, expect, it } from 'vitest'

import { parsePrintEvent } from './event-store'

const snapshot = {
  path: 'filament/material.json',
  sha256: 'abc123',
  custom_json: { name: 'Material' },
}

const baseEvent = {
  type: 'print',
  id: 'event-1',
  printed_at: '2026-07-28T12:00:00.000Z',
  actor: 'user',
  result: 'success',
  note: '',
  process: { ...snapshot, path: 'process/quality.json' },
}

describe('print event parser', () => {
  it('keeps legacy v1 material snapshots readable', () => {
    const event = parsePrintEvent({
      ...baseEvent,
      schema_version: 1,
      filaments: [snapshot],
    })

    expect(event?.schema_version).toBe(1)
  })

  it('reads v2 material assignments with roles', () => {
    const event = parsePrintEvent({
      ...baseEvent,
      schema_version: 2,
      materials: [
        { role: 'model', preset: snapshot },
        {
          role: 'support-interface',
          preset: { ...snapshot, path: 'filament/support.json' },
        },
      ],
    })

    expect(event?.schema_version).toBe(2)
    if (event?.schema_version === 2) {
      expect(event.materials.map((material) => material.role)).toEqual([
        'model',
        'support-interface',
      ])
    }
  })

  it('rejects unknown material roles', () => {
    expect(
      parsePrintEvent({
        ...baseEvent,
        schema_version: 2,
        materials: [{ role: 'left-nozzle', preset: snapshot }],
      }),
    ).toBeNull()
  })
})
