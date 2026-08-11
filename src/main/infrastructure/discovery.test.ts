import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, parse } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  discoverWorkspaceRoot,
  ensureWorkspaceRoot,
  isWorkspaceRoot,
  workspacePaths,
} from './discovery'

const temporaryRoots: string[] = []

afterEach(async () => {
  delete process.env.ORCA_PRESET_ASSISTANT_WORKSPACE
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  )
})

describe('workspace discovery', () => {
  it('creates the product folders, preset kinds, and reusable workspace guidance', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orca-workspace-'))
    temporaryRoots.push(root)

    const paths = await ensureWorkspaceRoot(root)

    expect((await readdir(root)).sort()).toEqual(['PrintHistory', 'UserPresets'])
    expect((await readdir(paths.userPresets)).sort()).toEqual([
      'AGENTS.md',
      'filament',
      'machine',
      'process',
    ])
    expect(await readFile(join(paths.userPresets, 'AGENTS.md'), 'utf8')).toContain(
      'Treat a change as successful only after Orca returns an authoritative receipt',
    )
    expect(await readdir(paths.printHistory)).toEqual([])
    expect(await isWorkspaceRoot(root)).toBe(true)
  })

  it('never overwrites existing workspace guidance', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orca-workspace-'))
    temporaryRoots.push(root)
    const paths = await ensureWorkspaceRoot(root)
    await writeFile(join(paths.userPresets, 'AGENTS.md'), '# User-owned guidance\n', 'utf8')

    await ensureWorkspaceRoot(root)

    expect(await readFile(join(paths.userPresets, 'AGENTS.md'), 'utf8')).toBe(
      '# User-owned guidance\n',
    )
  })

  it('resolves a saved workspace without searching Bambu Studio data', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orca-workspace-'))
    temporaryRoots.push(root)
    await ensureWorkspaceRoot(root)

    await expect(discoverWorkspaceRoot(root)).resolves.toEqual({
      path: workspacePaths(root).root,
      source: 'saved',
    })
  })

  it('rejects a filesystem root as a managed workspace', async () => {
    const filesystemRoot = parse(process.cwd()).root
    await expect(ensureWorkspaceRoot(filesystemRoot)).rejects.toThrow('invalid-workspace-root')
  })

  it('rejects an existing slicer preset root before creating product folders', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orca-existing-presets-'))
    temporaryRoots.push(root)
    await mkdir(join(root, 'process'))
    await mkdir(join(root, 'filament'))

    await expect(ensureWorkspaceRoot(root)).rejects.toThrow('slicer-preset-root-is-not-a-workspace')
    expect((await readdir(root)).sort()).toEqual(['filament', 'process'])
  })
})
