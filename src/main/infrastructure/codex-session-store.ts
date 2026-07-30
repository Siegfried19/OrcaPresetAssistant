import { join } from 'node:path'

import type { CodexPermissionScope } from '@shared/contracts'

import { atomicWriteJson } from './atomic-write'

export interface CodexSessionState {
  readonly schemaVersion: 1
  readonly generatedAt: string
  readonly heartbeatAt: string
  readonly scope: CodexPermissionScope
}

export class CodexSessionStore {
  private readonly filePath: string
  private readonly generatedAt = new Date().toISOString()

  public constructor(userDataPath: string) {
    this.filePath = join(userDataPath, 'codex-session.json')
  }

  public async heartbeat(scope: CodexPermissionScope): Promise<void> {
    await atomicWriteJson(this.filePath, {
      schemaVersion: 1,
      generatedAt: this.generatedAt,
      heartbeatAt: new Date().toISOString(),
      scope,
    } satisfies CodexSessionState)
  }
}
