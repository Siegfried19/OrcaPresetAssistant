import { describe, expect, it } from 'vitest'

import { applyGitState, readGitSnapshot } from './git-service'
import { scanPresets } from './preset-repository'
import { workspacePaths } from './discovery'

const rootPath = process.env.ORCA_PRESET_ASSISTANT_WORKSPACE

describe.skipIf(!rootPath)('real Orca Preset Assistant workspace', () => {
  it('scans registered presets without changing the source directory', async () => {
    if (!rootPath) throw new Error('ORCA_PRESET_ASSISTANT_WORKSPACE is required')

    const userPresetsPath = workspacePaths(rootPath).userPresets
    const presets = await scanPresets(userPresetsPath)
    const gitSnapshot = await readGitSnapshot(userPresetsPath)
    await applyGitState(userPresetsPath, presets, gitSnapshot)

    expect(presets.length).toBeGreaterThan(0)
    expect(presets.some((preset) => preset.kind === 'process')).toBe(true)
    expect(presets.some((preset) => preset.kind === 'filament')).toBe(true)
    expect(presets.flatMap((preset) => preset.validationIssues)).toEqual([])
    expect(gitSnapshot.isRepository).toBe(true)
    expect(presets.every((preset) => preset.gitState !== 'unknown')).toBe(true)
  })
})
