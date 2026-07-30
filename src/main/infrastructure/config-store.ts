import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { CodexPermissionScope, UpdateSettingsRequest } from '@shared/contracts'

import type { AppConfig } from '../domain/models'
import { atomicWriteJson } from './atomic-write'

export const DEFAULT_APP_CONFIG: AppConfig = {
  schemaVersion: 1,
  language: 'zh-CN',
  autoArchive: true,
  threeMfPolicy: 'ask',
  codexPermissions: {
    scope: 'general',
    fileGrants: [],
  },
}

export class ConfigStore {
  private readonly filePath: string

  public constructor(userDataPath: string) {
    this.filePath = join(userDataPath, 'config.json')
  }

  public async read(): Promise<AppConfig> {
    try {
      const parsed: unknown = JSON.parse(await readFile(this.filePath, 'utf8'))
      return normalizeConfig(parsed)
    } catch {
      return DEFAULT_APP_CONFIG
    }
  }

  public async saveWorkspaceRoot(workspaceRoot: string): Promise<AppConfig> {
    return this.update((config) => ({ ...config, workspaceRoot }))
  }

  public async saveSettings(request: UpdateSettingsRequest): Promise<AppConfig> {
    return this.update((config) => ({
      ...config,
      ...(request.language === undefined ? {} : { language: request.language }),
      ...(request.autoArchive === undefined ? {} : { autoArchive: request.autoArchive }),
      ...(request.threeMfPolicy === undefined ? {} : { threeMfPolicy: request.threeMfPolicy }),
    }))
  }

  public async saveCodexPermissions(
    scope: CodexPermissionScope,
    fileGrants: readonly string[],
  ): Promise<AppConfig> {
    const persistentScope = scope === 'current-project' ? 'general' : scope
    return this.update((config) => ({
      ...config,
      codexPermissions: {
        scope: persistentScope,
        fileGrants: [...fileGrants],
      },
    }))
  }

  private async update(change: (config: AppConfig) => AppConfig): Promise<AppConfig> {
    const next = change(await this.read())
    await atomicWriteJson(this.filePath, next)
    return next
  }
}

function normalizeConfig(value: unknown): AppConfig {
  if (typeof value !== 'object' || value === null) return DEFAULT_APP_CONFIG
  const record = value as Record<string, unknown>
  if (record.schemaVersion !== 1) return DEFAULT_APP_CONFIG

  const permissions =
    typeof record.codexPermissions === 'object' && record.codexPermissions !== null
      ? (record.codexPermissions as Record<string, unknown>)
      : {}
  const scope =
    isScope(permissions.scope) && permissions.scope !== 'current-project'
      ? permissions.scope
      : 'general'
  const fileGrants = Array.isArray(permissions.fileGrants)
    ? permissions.fileGrants.filter((path): path is string => typeof path === 'string')
    : []

  return {
    schemaVersion: 1,
    ...(typeof record.workspaceRoot === 'string' ? { workspaceRoot: record.workspaceRoot } : {}),
    language: record.language === 'en' || record.language === 'zh-CN' ? record.language : 'zh-CN',
    autoArchive: typeof record.autoArchive === 'boolean' ? record.autoArchive : true,
    threeMfPolicy:
      record.threeMfPolicy === 'always' ||
      record.threeMfPolicy === 'ask' ||
      record.threeMfPolicy === 'never'
        ? record.threeMfPolicy
        : 'ask',
    codexPermissions: {
      scope,
      fileGrants,
    },
  }
}

function isScope(value: unknown): value is CodexPermissionScope {
  return value === 'general' || value === 'current-settings' || value === 'current-project'
}
