import { describe, expect, it } from 'vitest'

import { applyGitState, readGitSnapshot } from './git-service'
import { scanPresets } from './preset-repository'

const rootPath = process.env.BAMBU_PRESET_ROOT

describe.skipIf(!rootPath)('real preset root', () => {
  it('scans registered presets without changing the source directory', async () => {
    if (!rootPath) throw new Error('BAMBU_PRESET_ROOT is required')

    const presets = await scanPresets(rootPath)
    const gitSnapshot = await readGitSnapshot(rootPath)
    await applyGitState(rootPath, presets, gitSnapshot)

    expect(presets.length).toBeGreaterThan(0)
    expect(presets.some((preset) => preset.kind === 'process')).toBe(true)
    expect(presets.some((preset) => preset.kind === 'filament')).toBe(true)
    expect(presets.flatMap((preset) => preset.validationIssues)).toEqual([])
    expect(gitSnapshot.isRepository).toBe(true)
    expect(presets.every((preset) => preset.gitState !== 'unknown')).toBe(true)
  })
})
