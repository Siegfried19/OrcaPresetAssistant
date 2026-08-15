---
name: orca-preset-assistant
description: Safely inspect OrcaSlicer user presets, current effective settings, explicitly authorized current-project parts, placement and model geometry, optional project-external STL/3MF files, and physical print history. Use when the user asks for Orca parameter advice, wants a preset comparison or change proposal, asks what is currently selected or placed, asks about the shape of loaded models, or wants to review prior print evidence.
---

# Orca Preset Assistant

## Workflow

1. Call `get_access_status` before requesting Orca or model data.
2. If access is `general`, do not read live Orca state, current-project data, or print history. Workspace user-preset files may still be listed, inspected, logged, and edited for an explicit preset-file task.
3. `list_user_presets` reads only the selected workspace files and does not read live Orca settings. Use `get_current_orca_settings` or `list_print_history` only when the user explicitly asks for that information and the tool confirms `current-settings` or broader access.
4. Use `get_current_project_layout` only with `current-project` access. It returns the current presets, effective settings, part placement, geometry summaries, and orthographic previews for supported STL/3MF sources loaded in the open project. Do not infer the unsaved project from recent files.
5. Use `inspect_granted_model_file` only for a project-external STL/3MF path already listed in `fileGrants`; models in the open project do not need a second per-file grant.
6. Separate machine, process, filament slot, and material role. Never infer a support role from slot number.
7. Separate completed physical evidence from pending or manually limited records.

## Workspace setup

- Ask the user to choose a normal parent folder, not `UserPresets` itself. The app creates `<Workspace>/UserPresets/{machine,process,filament}` and `<Workspace>/PrintHistory`.
- A new workspace receives `UserPresets/AGENTS.md` with reusable proposal and verification rules. The app never overwrites an existing `AGENTS.md`.
- Official Orca presets remain read-only reference data outside the workspace. Do not copy or edit them as though they were user presets.

## Parameter changes

Always show the exact before/after delta, reason, expected result, and tradeoff. There are two separate write flows.

### Permanent workspace user presets

Use this as the default for creating or updating a permanent process or filament user preset. Orca may be open or closed.

1. Read the target user JSON from `<Workspace>/UserPresets`, plus its matching `.info` file and official inheritance chain. Do not read live Orca settings unless the user explicitly asks to use the current Orca selection or effective values.
2. Call `log_user_preset_file_change` before editing. The tool records the disk `before` values and hash and returns the exact target paths. This background log is not the write itself and is deliberately not shown as an extra slicing-panel card.
3. Edit the user JSON directly, preserving minimal intentional overrides and the file's existing formatting. Update or create the matching `.info` only when preset identity requires it.
4. Verify JSON parsing, filename/name/settings-ID agreement, matching `.info`, parent existence, `.info base_id`, and the logged `after` values. Never edit an official system preset.
5. Tell the user to click the panel's single refresh action. When Orca is open it hot-loads new and modified targets and hot-unloads workspace presets whose JSON or `.info` was deleted; when Orca is closed the background record remains **written** and the files load at the next Orca start. Report **loaded** only after the background record has an Orca native revision.

For `create`, normally start from an existing compatible workspace user preset named by `sourcePresetName`, then change the filename, JSON `name`, and `print_settings_id` or `filament_settings_id` together. Preserve the intended official `inherits` parent and `.info base_id`. A copied `.info` must not reuse another preset's cloud `setting_id` or `sync_info`; clear those identity values so Orca can register the new local preset.

Do not call `queue_preset_change` for this permanent-file flow. The background file-change record has no accept/reject step.

### Current Orca project

Use this only when the user explicitly wants a session-only change in the currently open project. Call `get_current_orca_settings` immediately before preparing the proposal. Its `writeCapabilities` is authoritative; require `controlled-write`, preserve scalar/vector rules, and use `queue_preset_change` with destination `current-project`. A queued or approved proposal is not applied until Orca returns its authoritative receipt and fresh revision.

Machine presets remain read-only in both flows. Never overwrite an official system preset.

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
