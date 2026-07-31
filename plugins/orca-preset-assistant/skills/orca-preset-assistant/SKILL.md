---
name: orca-preset-assistant
description: Safely inspect OrcaSlicer user presets, current effective settings, explicitly authorized current-project parts, placement and model geometry, optional project-external STL/3MF files, and physical print history. Use when the user asks for Orca parameter advice, wants a preset comparison or change proposal, asks what is currently selected or placed, asks about the shape of loaded models, or wants to review prior print evidence.
---

# Orca Preset Assistant

## Workflow

1. Call `get_access_status` before requesting Orca or model data.
2. If access is `general`, give general advice without reading presets, live state, history, or files.
3. Use `list_user_presets`, `get_current_orca_settings`, or `list_print_history` only when the tool confirms `current-settings` or broader access.
4. Use `get_current_project_layout` only with `current-project` access. It returns the current presets, effective settings, part placement, geometry summaries, and orthographic previews for supported STL/3MF sources loaded in the open project. Do not infer the unsaved project from recent files.
5. Use `inspect_granted_model_file` only for a project-external STL/3MF path already listed in `fileGrants`; models in the open project do not need a second per-file grant.
6. Separate machine, process, filament slot, and material role. Never infer a support role from slot number.
7. Separate completed physical evidence from pending or manually limited records.

## Parameter changes

Always show the exact before/after delta, reason, expected result, and tradeoff. Obtain one explicit destination:

1. `current-project`
2. `update-current-preset`
3. `save-as-new-preset`

Call `queue_preset_change` only after the destination is explicit. A queued proposal is pending approval; never report it as applied. Report success only after Orca returns an authoritative applied receipt and the live revision contains the requested values.

For a workspace user preset, pass the exact `id` returned by `list_user_presets`. When saving from the currently selected official preset, use `orca:<kind>:<exact selected name>` and only choose `save-as-new-preset`.

Never overwrite an official system preset. Permanent creation and updates must use Orca's native save path so JSON identity and any metadata managed by Orca remain consistent. Existing local-only JSON presets without `.info` cloud identity metadata are valid and must not be reported as structurally broken.

Machine presets are read-only. Only queue process or filament keys listed by the product's controlled native write capabilities; if a requested key is outside that list, explain the limit instead of trying to bypass it.

## Privacy and evidence

- A saved 3MF is a snapshot, not proof of unsaved in-memory state.
- A `custom-presets-only` history record is useful but does not contain all effective settings.
- Preserve failed prints and rolled-back changes as evidence.
- `current-project` is session-only and includes only model sources reported by the open Orca project.
- Do not expose account tokens, printer access codes, unrelated recent files, or ungranted project-external paths.

## Local preset versions

The panel's version controls apply only to `<Workspace>/UserPresets/machine`, `process`, and `filament`.
They deliberately exclude `PrintHistory`, `AGENTS.md`, `CHANGELOG.md`, and other AI notes.

- Treat only a Git repository whose top-level directory is exactly `UserPresets` as the preset repository. Never borrow a parent repository.
- If no independent preset repository exists, explain the local-only scope and obtain explicit user approval before initializing it. The panel's **Enable Local Versions** action is the preferred route.
- Use the panel's **Save Version** and **Version History** actions for normal snapshots and restores. A restore creates a new commit; it does not rewrite history or detach HEAD.
- Never initialize, stage, commit, restore, or change remotes from Codex unless the user explicitly asks. The panel does not push, pull, create branches, or configure a remote.
- When Codex is asked to work directly in `UserPresets`, inspect the repository status first, preserve pre-existing changes, and keep preset edits separate from AI-only documentation.
