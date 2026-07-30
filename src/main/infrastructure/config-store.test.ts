import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { ConfigStore } from './config-store'

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  )
})

describe('workspace config', () => {
  it('writes and reads workspaceRoot', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orca-config-'))
    temporaryRoots.push(root)
    const store = new ConfigStore(root)

    await store.saveWorkspaceRoot('D:\\OrcaWorkspace')

    await expect(store.read()).resolves.toEqual({
      schemaVersion: 1,
      workspaceRoot: 'D:\\OrcaWorkspace',
      language: 'zh-CN',
      autoArchive: true,
      threeMfPolicy: 'ask',
      codexPermissions: { scope: 'general', fileGrants: [] },
    })
    expect(JSON.parse(await readFile(join(root, 'config.json'), 'utf8'))).toEqual({
      schemaVersion: 1,
      workspaceRoot: 'D:\\OrcaWorkspace',
      language: 'zh-CN',
      autoArchive: true,
      threeMfPolicy: 'ask',
      codexPermissions: { scope: 'general', fileGrants: [] },
    })
  })

  it('persists settings without implicitly expanding Codex permissions', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orca-config-'))
    temporaryRoots.push(root)
    const store = new ConfigStore(root)

    await store.saveSettings({ language: 'en', autoArchive: false, threeMfPolicy: 'never' })

    await expect(store.read()).resolves.toMatchObject({
      language: 'en',
      autoArchive: false,
      threeMfPolicy: 'never',
      codexPermissions: { scope: 'general', fileGrants: [] },
    })
  })

  it('never persists current-project permission across restarts', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orca-config-'))
    temporaryRoots.push(root)
    const store = new ConfigStore(root)

    await store.saveCodexPermissions('current-project', [])

    await expect(store.read()).resolves.toMatchObject({
      codexPermissions: { scope: 'general', fileGrants: [] },
    })
  })

  it('does not accept the legacy presetRoot setting', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orca-config-'))
    temporaryRoots.push(root)
    await writeFile(
      join(root, 'config.json'),
      JSON.stringify({ schemaVersion: 1, presetRoot: 'legacy' }),
      'utf8',
    )

    await expect(new ConfigStore(root).read()).resolves.toMatchObject({
      schemaVersion: 1,
      codexPermissions: { scope: 'general', fileGrants: [] },
    })
  })
})
