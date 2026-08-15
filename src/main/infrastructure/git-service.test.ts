import { execFile } from 'node:child_process'
import { access, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { afterEach, describe, expect, it } from 'vitest'

import {
  initializePresetRepository,
  parsePorcelainStatus,
  readGitSnapshot,
  readPresetVersions,
  restorePresetVersion,
  savePresetVersion,
} from './git-service'

const execFileAsync = promisify(execFile)
const roots: string[] = []

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) =>
      rm(root, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 100,
      }),
    ),
  )
})

async function createPresetRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'orca-git-service-'))
  roots.push(root)
  await Promise.all(
    ['machine', 'process', 'filament'].map((directory) =>
      mkdir(join(root, directory), { recursive: true }),
    ),
  )
  return root
}

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

describe('preset version repository', () => {
  it('requires a repository rooted at UserPresets instead of borrowing a parent repository', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'orca-parent-repository-'))
    roots.push(parent)
    await execFileAsync('git', ['init', parent])
    const child = join(parent, 'UserPresets')
    await Promise.all(
      ['machine', 'process', 'filament'].map((directory) =>
        mkdir(join(child, directory), { recursive: true }),
      ),
    )

    expect((await readGitSnapshot(child)).isRepository).toBe(false)
  })

  it('recognizes the repository root through an equivalent filesystem alias', async () => {
    const container = await mkdtemp(join(tmpdir(), 'orca-aliased-repository-'))
    roots.push(container)
    const root = join(container, 'actual')
    const alias = join(container, 'alias')
    await mkdir(root, { recursive: true })
    await initializePresetRepository(root)
    await symlink(root, alias, process.platform === 'win32' ? 'junction' : 'dir')

    expect((await readGitSnapshot(alias)).isRepository).toBe(true)
  })

  it('retains the original Git failure as the error cause', async () => {
    const container = await mkdtemp(join(tmpdir(), 'orca-missing-repository-'))
    roots.push(container)
    const missingRoot = join(container, 'missing')

    await expect(initializePresetRepository(missingRoot)).rejects.toMatchObject({
      message: 'git-operation-failed',
      cause: expect.any(Error),
    })
  })

  it('initializes, saves, lists, and restores preset-only versions', async () => {
    const root = await createPresetRoot()
    const preset = join(root, 'process', 'Quality.json')
    const aiGuidance = join(root, 'AGENTS.md')
    await initializePresetRepository(root)
    expect((await readGitSnapshot(root)).isRepository).toBe(true)

    await writeFile(preset, '{"name":"Quality","layer_height":0.2}\n', 'utf8')
    await writeFile(aiGuidance, '# AI-only guidance\n', 'utf8')
    await savePresetVersion(root, 'Initial preset version')
    const first = (await readPresetVersions(root))[0]
    expect(first?.message).toBe('Initial preset version')
    expect(
      (await execFileAsync('git', ['-C', root, 'ls-files', '--', 'AGENTS.md'])).stdout.trim(),
    ).toBe('')

    await writeFile(preset, '{"name":"Quality","layer_height":0.16}\n', 'utf8')
    await savePresetVersion(root, 'Improve layer quality')
    expect((await readPresetVersions(root)).map((version) => version.message)).toEqual([
      'Improve layer quality',
      'Initial preset version',
    ])

    const laterPreset = join(root, 'process', 'Later.json')
    await writeFile(laterPreset, '{"name":"Later"}\n', 'utf8')
    await savePresetVersion(root, 'Add later preset')
    await restorePresetVersion(root, first!.revision)
    expect(await readFile(preset, 'utf8')).toContain('"layer_height":0.2')
    await expect(access(laterPreset)).rejects.toThrow()
    expect((await readPresetVersions(root))[0]?.message).toContain('Restore preset version')
  }, 15_000)

  it('refuses to restore while preset files have unsaved changes', async () => {
    const root = await createPresetRoot()
    const preset = join(root, 'filament', 'Material.json')
    await initializePresetRepository(root)
    await writeFile(preset, '{"name":"Material","nozzle_temperature":260}\n', 'utf8')
    await savePresetVersion(root, 'Initial material')
    const version = (await readPresetVersions(root))[0]!

    await writeFile(preset, '{"name":"Material","nozzle_temperature":265}\n', 'utf8')
    await expect(restorePresetVersion(root, version.revision)).rejects.toThrow(
      'git-working-tree-dirty',
    )
  })

  it('refuses to include a staged file outside the preset directories', async () => {
    const root = await createPresetRoot()
    await initializePresetRepository(root)
    await writeFile(join(root, 'process', 'Quality.json'), '{"name":"Quality"}\n', 'utf8')
    await writeFile(join(root, 'CHANGELOG.md'), '# Notes\n', 'utf8')
    await execFileAsync('git', ['-C', root, 'add', 'CHANGELOG.md'])

    await expect(savePresetVersion(root, 'Preset only')).rejects.toThrow('git-working-tree-dirty')
  })
})
