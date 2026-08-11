import path from 'node:path'
import readline from 'node:readline'

import { inspectModelFile } from './model-inspector.mjs'
import {
  accessStatus,
  listPresets,
  listPrintHistory,
  queuePresetChange,
  readLiveState,
} from './state.mjs'

const MCP_RESULT = Symbol('mcp-result')
const MAX_CURRENT_PROJECT_MODELS = 16

const tools = [
  {
    name: 'get_access_status',
    description: 'Return the active Orca data permission without expanding it.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'list_user_presets',
    description: 'List workspace user presets. Requires current-settings permission.',
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['machine', 'process', 'filament'] },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_current_orca_settings',
    description:
      'Read fresh effective settings and authoritative writable-parameter metadata from Orca without geometry. Requires current-settings.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_current_project_layout',
    description:
      'Read current presets, effective settings, part placement, and geometry previews for models loaded in Orca. Requires current-project.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'inspect_granted_model_file',
    description:
      'Inspect one project-external STL or 3MF path already granted by the user. Current-project models do not require this extra grant.',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string', minLength: 1 } },
      required: ['path'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_print_history',
    description: 'List physical print evidence. Requires current-settings permission.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'queue_preset_change',
    description:
      'Queue a controlled process or filament parameter proposal for panel approval. Machine presets are read-only; this never applies a change itself.',
    inputSchema: {
      type: 'object',
      properties: {
        destination: {
          type: 'string',
          enum: ['current-project', 'update-current-preset', 'save-as-new-preset'],
        },
        presetKind: { type: 'string', enum: ['process', 'filament'] },
        presetId: { type: 'string', minLength: 1 },
        newPresetName: { type: 'string' },
        before: { type: 'object', additionalProperties: true, minProperties: 1 },
        after: { type: 'object', additionalProperties: true, minProperties: 1 },
        reason: { type: 'string', minLength: 1, maxLength: 2000 },
      },
      required: ['destination', 'presetKind', 'presetId', 'before', 'after', 'reason'],
      additionalProperties: false,
    },
  },
]

function textResult(value, isError = false) {
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    ...(isError ? { isError: true } : { structuredContent: value }),
  }
}

function inspectionResult(value, title) {
  const content = [{ type: 'text', text: JSON.stringify(value.summary, null, 2) }]
  if (value.preview) {
    content.push({ type: 'text', text: title })
    content.push({
      type: 'image',
      data: value.preview.data,
      mimeType: value.preview.mimeType,
    })
  }
  return {
    content,
    structuredContent: value.summary,
  }
}

function projectSourceFiles(project) {
  const objects = project?.placement?.objects
  if (!Array.isArray(objects)) return []
  const unique = new Map()
  for (const object of objects) {
    if (!Array.isArray(object?.sourceFiles)) continue
    for (const value of object.sourceFiles) {
      if (typeof value !== 'string' || !path.isAbsolute(value)) continue
      const extension = path.extname(value).toLowerCase()
      if (extension !== '.stl' && extension !== '.3mf') continue
      const resolved = path.resolve(value)
      const key = process.platform === 'win32' ? resolved.toLowerCase() : resolved
      if (!unique.has(key)) unique.set(key, resolved)
    }
  }
  return [...unique.values()]
}

function currentProjectResult(live) {
  const allSources = projectSourceFiles(live.project)
  const sources = allSources.slice(0, MAX_CURRENT_PROJECT_MODELS)
  const inspections = []
  const previews = []
  for (const source of sources) {
    try {
      const inspected = inspectModelFile(source)
      inspections.push(inspected.summary)
      if (inspected.preview) {
        previews.push({
          fileName: inspected.summary.fileName,
          preview: inspected.preview,
        })
      }
    } catch (error) {
      inspections.push({
        fileName: path.basename(source),
        error: error instanceof Error ? error.message : 'Model inspection failed.',
      })
    }
  }
  const value = {
    generatedAt: live.generatedAt,
    revision: live.revision,
    selections: live.selections,
    settings: live.settings,
    writeCapabilities: live.writeCapabilities,
    project: live.project,
    modelGeometry: {
      sourceCount: allSources.length,
      inspectedCount: sources.length,
      truncated: allSources.length > sources.length,
      models: inspections,
    },
  }
  const content = [{ type: 'text', text: JSON.stringify(value, null, 2) }]
  for (const item of previews) {
    content.push({
      type: 'text',
      text: `${item.fileName}: top, front, and side geometry preview.`,
    })
    content.push({
      type: 'image',
      data: item.preview.data,
      mimeType: item.preview.mimeType,
    })
  }
  return { content, structuredContent: value }
}

function callTool(name, input = {}) {
  if (name === 'get_access_status') return accessStatus()
  if (name === 'list_user_presets') return { presets: listPresets(input.kind) }
  if (name === 'get_current_orca_settings') {
    const live = readLiveState('current-settings')
    return {
      generatedAt: live.generatedAt,
      revision: live.revision,
      selections: live.selections,
      settings: live.settings,
      writeCapabilities: live.writeCapabilities,
    }
  }
  if (name === 'get_current_project_layout') {
    const live = readLiveState('current-project')
    return { [MCP_RESULT]: currentProjectResult(live) }
  }
  if (name === 'inspect_granted_model_file') {
    const status = accessStatus()
    const requested = path.resolve(String(input.path ?? ''))
    const granted = status.fileGrants.some((value) => path.resolve(value) === requested)
    if (!granted) {
      throw new Error('This exact model path is not granted in the panel.')
    }
    const inspected = inspectModelFile(requested)
    return {
      [MCP_RESULT]: inspectionResult(
        inspected,
        `${inspected.summary.fileName}: top, front, and side geometry preview.`,
      ),
    }
  }
  if (name === 'list_print_history') return { records: listPrintHistory() }
  if (name === 'queue_preset_change') return queuePresetChange(input)
  throw new Error(`Unknown tool: ${name}`)
}

function writeResult(id, result) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`)
}

function writeError(id, code, message) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } })}\n`)
}

function handle(message) {
  if (!message || message.jsonrpc !== '2.0') return
  const { id, method, params = {} } = message
  if (method === 'initialize') {
    writeResult(id, {
      protocolVersion: params.protocolVersion ?? '2025-06-18',
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'orca-preset-assistant', version: '0.1.0' },
    })
    return
  }
  if (method === 'ping') {
    writeResult(id, {})
    return
  }
  if (method === 'tools/list') {
    writeResult(id, { tools })
    return
  }
  if (method === 'tools/call') {
    try {
      const value = callTool(params.name, params.arguments ?? {})
      writeResult(id, value?.[MCP_RESULT] ?? textResult(value))
    } catch (error) {
      writeResult(
        id,
        textResult({ error: error instanceof Error ? error.message : 'Tool call failed.' }, true),
      )
    }
    return
  }
  if (id !== undefined) writeError(id, -32601, `Method not found: ${method}`)
}

const input = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
})

input.on('line', (line) => {
  const trimmed = line.trim()
  if (!trimmed) return
  try {
    handle(JSON.parse(trimmed))
  } catch (error) {
    writeError(null, -32700, error instanceof Error ? error.message : 'Parse error')
  }
})
