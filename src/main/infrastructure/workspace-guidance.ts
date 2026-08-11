import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const WORKSPACE_GUIDANCE = `# Orca Preset Assistant workspace guidance

## Scope

- This directory contains live Orca/Bambu user presets. Treat official system presets as read-only reference data.
- Preserve user changes and slicer-generated metadata. Existing dirty files are user-owned unless proven otherwise.
- Prefer small, hypothesis-driven parameter changes over unrelated bundles.

## Before proposing a parameter change

- Read the current Orca selections, effective values, and native write capabilities first.
- Compare the user preset with its complete official inheritance chain. An omitted key is inherited, not necessarily missing.
- State the symptom, exact before/after values, rationale, expected result, and tradeoff.
- Only propose keys published by Orca as controlled-write capabilities for the selected preset kind.
- Distinguish panel-visible settings from hidden settings. If Orca reports a setting as hidden, say that it has no current panel control and do not invent a UI path.

## Apply and verify

- A queued or approved proposal is not yet applied.
- Let Orca perform all writes. Do not hand-create preset identity metadata or fabricate matching .info files.
- Treat a change as successful only after Orca returns an authoritative receipt and fresh live state confirms the expected values and revision.
- Use the explicit destination selected by the user: current project, update current permanent preset, or save as a new permanent preset.
- Official presets must be saved as a new user preset instead of being overwritten.

## Local history

- Do not initialize Git, stage, commit, push, or publish unless the user explicitly requests it.
- Preserve unrelated files and generated state. Record only the intended experiment when local history is requested.
`

export const WORKSPACE_GUIDANCE_FILE = 'AGENTS.md'

export async function ensureWorkspaceGuidance(userPresetsPath: string): Promise<void> {
  try {
    await writeFile(join(userPresetsPath, WORKSPACE_GUIDANCE_FILE), WORKSPACE_GUIDANCE, {
      encoding: 'utf8',
      flag: 'wx',
    })
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
  }
}
