import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { queuePresetChange } from './state.mjs'

test('ordinary process and filament settings can be queued for panel approval', () => {
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
      }),
    )

    const processResult = queuePresetChange({
      destination: 'update-current-preset',
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
      destination: 'update-current-preset',
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
          destination: 'update-current-preset',
          presetKind: 'process',
          presetId: 'process:process/example.json',
          before: { machine_start_gcode: 'old' },
          after: { machine_start_gcode: 'new' },
          reason: 'This must remain outside the ordinary whitelist.',
        }),
      /outside the controlled Orca write whitelist/,
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
