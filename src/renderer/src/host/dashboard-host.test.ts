import { describe, expect, it, vi } from 'vitest'

import { PrintArchiveGuard } from './dashboard-host'

function storage(initial: Record<string, string> = {}): Storage {
  const values = new Map(Object.entries(initial))
  return {
    get length() {
      return values.size
    },
    clear: vi.fn(() => values.clear()),
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    key: vi.fn((index: number) => [...values.keys()][index] ?? null),
    removeItem: vi.fn((key: string) => values.delete(key)),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
  }
}

describe('print archive guard', () => {
  it('claims a submitted print before asynchronous work can duplicate the prompt', () => {
    const guard = new PrintArchiveGuard(storage())

    expect(guard.claim('archive-1')).toBe(true)
    expect(guard.claim('archive-1')).toBe(false)

    guard.release('archive-1')
    expect(guard.claim('archive-1')).toBe(true)
  })

  it('remembers a completed print across a WebView reload in the same Orca session', () => {
    const sessionStorage = storage()
    const firstView = new PrintArchiveGuard(sessionStorage)

    expect(firstView.claim('archive-1')).toBe(true)
    firstView.complete('archive-1')

    const reloadedView = new PrintArchiveGuard(sessionStorage)
    expect(reloadedView.claim('archive-1')).toBe(false)
    expect(reloadedView.claim('archive-2')).toBe(true)
  })

  it('continues using the in-memory guard when session storage is unavailable', () => {
    const unavailable = storage()
    vi.mocked(unavailable.getItem).mockImplementation(() => {
      throw new Error('storage unavailable')
    })
    vi.mocked(unavailable.setItem).mockImplementation(() => {
      throw new Error('storage unavailable')
    })
    const guard = new PrintArchiveGuard(unavailable)

    expect(guard.claim('archive-1')).toBe(true)
    guard.complete('archive-1')
    expect(guard.claim('archive-1')).toBe(false)
  })
})
