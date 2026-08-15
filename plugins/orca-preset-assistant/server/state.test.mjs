import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { logUserPresetFileChange, queuePresetChange } from './state.mjs'

test('direct user-preset changes are logged before writing without live Orca settings', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'orca-plugin-file-change-'))
  const previousUserData = process.env.ORCA_PRESET_ASSISTANT_USER_DATA
  process.env.ORCA_PRESET_ASSISTANT_USER_DATA = directory
  try {
    const workspace = path.join(directory, 'workspace')
    const processRoot = path.join(workspace, 'UserPresets', 'process')
    fs.mkdirSync(processRoot, { recursive: true })
    fs.writeFileSync(
      path.join(directory, 'config.json'),
      JSON.stringify({
        schemaVersion: 1,
        workspaceRoot: workspace,
        codexPermissions: { scope: 'general', fileGrants: [] },
      }),
    )
    const presetName = 'Quality_ai_suggestion'
    fs.writeFileSync(
      path.join(processRoot, `${presetName}.json`),
      JSON.stringify({
        name: presetName,
        print_settings_id: presetName,
        inherits: '0.20mm Standard',
        outer_wall_speed: ['60'],
        top_surface_speed: ['50'],
      }),
    )
    fs.writeFileSync(
      path.join(processRoot, `${presetName}.info`),
      'setting_id = \nbase_id = GP001\n',
    )

    const result = logUserPresetFileChange({
      operation: 'update',
      presetKind: 'process',
      presetName,
      changes: { outer_wall_speed: ['55'] },
      remove: ['top_surface_speed'],
      reason: 'Log the file edit before applying it.',
    })

    assert.equal(result.status, 'logged-before-write')
    assert.equal(result.targetJsonPath, path.join(processRoot, `${presetName}.json`))
    assert.deepEqual(result.before, {
      outer_wall_speed: ['60'],
      top_surface_speed: ['50'],
    })
    assert.deepEqual(result.after, { outer_wall_speed: ['55'], top_surface_speed: null })
    const inboxFiles = fs.readdirSync(path.join(directory, 'preset-file-change-inbox'))
    assert.equal(inboxFiles.length, 1)
    const request = JSON.parse(
      fs.readFileSync(path.join(directory, 'preset-file-change-inbox', inboxFiles[0]), 'utf8'),
    )
    assert.match(request.beforeFileHash, /^[0-9a-f]{64}$/u)
    assert.equal(request.relativePath, `process/${presetName}.json`)
    assert.equal(fs.existsSync(path.join(directory, 'native-state.json')), false)
  } finally {
    if (previousUserData === undefined) {
      delete process.env.ORCA_PRESET_ASSISTANT_USER_DATA
    } else {
      process.env.ORCA_PRESET_ASSISTANT_USER_DATA = previousUserData
    }
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('ordinary process and filament settings can be queued for the current project', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'orca-plugin-state-'))
  const previousUserData = process.env.ORCA_PRESET_ASSISTANT_USER_DATA
  process.env.ORCA_PRESET_ASSISTANT_USER_DATA = directory
  try {
    const now = new Date().toISOString()
    fs.writeFileSync(
      path.join(directory, 'config.json'),
      JSON.stringify({
        schemaVersion: 1,
        workspaceRoot: directory,
        codexPermissions: { scope: 'current-settings', fileGrants: [] },
      }),
    )
    fs.writeFileSync(
      path.join(directory, 'native-state.json'),
      JSON.stringify({
        schemaVersion: 1,
        source: 'orca-native',
        generatedAt: now,
        revision: '12',
        writeCapabilities: {
          process: {
            access: 'controlled-write',
            settings: [
              { key: 'support_interface_speed' },
              { key: 'support_interface_loop_pattern' },
            ],
          },
          filament: {
            access: 'controlled-write',
            settings: [{ key: 'fan_cooling_layer_time' }],
          },
          machine: { access: 'read-only', settings: [] },
        },
      }),
    )

    const processResult = queuePresetChange({
      destination: 'current-project',
      presetKind: 'process',
      presetId: 'process:process/example.json',
      before: {
        support_interface_speed: '30,30',
        support_interface_loop_pattern: false,
      },
      after: {
        support_interface_speed: 20,
        support_interface_loop_pattern: true,
      },
      reason: 'Reduce ABS support-interface drag while keeping the final choice in Orca.',
    })
    assert.equal(processResult.status, 'pending-panel-approval')

    const filamentResult = queuePresetChange({
      destination: 'current-project',
      presetKind: 'filament',
      presetId: 'filament:filament/example.json',
      before: { fan_cooling_layer_time: '60,60' },
      after: { fan_cooling_layer_time: '45,45' },
      reason: 'Exercise a normal filament cooling parameter.',
    })
    assert.equal(filamentResult.status, 'pending-panel-approval')

    const requests = fs
      .readdirSync(path.join(directory, 'mcp-inbox'))
      .map((name) => JSON.parse(fs.readFileSync(path.join(directory, 'mcp-inbox', name), 'utf8')))
    assert.equal(requests.length, 2)
    assert.ok(
      requests.some(
        (request) =>
          request.after.support_interface_speed === 20 &&
          request.after.support_interface_loop_pattern === true,
      ),
    )
    assert.ok(requests.some((request) => request.after.fan_cooling_layer_time === '45,45'))

    assert.throws(
      () =>
        queuePresetChange({
          destination: 'current-project',
          presetKind: 'process',
          presetId: 'process:process/example.json',
          before: { machine_start_gcode: 'old' },
          after: { machine_start_gcode: 'new' },
          reason: 'This must remain outside the native capability set.',
        }),
      /not present in Orca's controlled-write capabilities/,
    )
  } finally {
    if (previousUserData === undefined) {
      delete process.env.ORCA_PRESET_ASSISTANT_USER_DATA
    } else {
      process.env.ORCA_PRESET_ASSISTANT_USER_DATA = previousUserData
    }
    fs.rmSync(directory, { recursive: true, force: true })
  }
})
