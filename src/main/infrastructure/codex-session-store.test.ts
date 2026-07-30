import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { CodexSessionStore, type CodexSessionState } from './codex-session-store'

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  )
})

describe('Codex session heartbeat', () => {
  it('writes only the current scope and freshness timestamps', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orca-session-'))
    temporaryRoots.push(root)
    const store = new CodexSessionStore(root)

    await store.heartbeat('current-project')

    const state = JSON.parse(
      await readFile(join(root, 'codex-session.json'), 'utf8'),
    ) as CodexSessionState
    expect(state).toEqual({
      schemaVersion: 1,
      generatedAt: expect.any(String),
      heartbeatAt: expect.any(String),
      scope: 'current-project',
    })
    expect(Object.keys(state).sort()).toEqual([
      'generatedAt',
      'heartbeatAt',
      'schemaVersion',
      'scope',
    ])
  })
})
