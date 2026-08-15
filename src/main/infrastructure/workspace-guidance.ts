import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const WORKSPACE_GUIDANCE = `# Orca Preset Assistant workspace guidance

## Scope

- This directory contains live Orca/Bambu user presets. Treat official system presets as read-only reference data.
- Preserve user changes and slicer-generated metadata. Existing dirty files are user-owned unless proven otherwise.
- Prefer small, hypothesis-driven parameter changes over unrelated bundles.

## Permanent user-preset files

- Orca may be open or closed. Reading live Orca settings is optional and must happen only when the user explicitly asks for it.
- Before editing, inspect the target JSON, matching .info file, and complete inheritance chain. An omitted key is inherited, not necessarily missing.
- Log the exact process or filament before/after values, removals, reason, and target path before changing the files.
- Then edit the user-preset JSON directly. Keep the filename, JSON name, settings ID, parent, and matching .info metadata consistent.
- For a new preset, normally copy an existing user preset as the source, rename its identity fields, and clear copied cloud-sync identity values. Never overwrite an official system preset or invent a cloud identity.
- The panel card is a change record, not an approval gate. After writing, use the panel refresh button. If Orca is open, refresh must hot-load only the logged preset and confirm the loaded values; if Orca is closed, the files remain valid and load on the next Orca start.
- A selected preset with unsaved Orca edits must not be hot-reloaded; preserve those edits and report the conflict.

## Current-project-only changes

- Use this flow only when the user explicitly asks to change the currently open project without editing a permanent user preset.
- Read fresh Orca selections, effective values, and native write capabilities first.
- Only propose keys published by Orca as controlled-write for the selected preset kind. Distinguish panel-visible settings from hidden settings and do not invent a UI path.
- A queued or approved proposal is not applied until Orca returns an authoritative receipt and fresh revision confirms the expected values.

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
