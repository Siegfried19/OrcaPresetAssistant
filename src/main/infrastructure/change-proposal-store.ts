import { randomUUID } from 'node:crypto'
import { lstat, mkdir, readFile, readdir, rename, rm } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'

import type {
  ApproveChangeProposalRequest,
  ChangeProposalView,
  GuardProposalRollbackRequest,
  ParameterSnapshot,
  ParameterValue,
  QueueChangeProposalRequest,
  RollbackGuardResult,
} from '@shared/contracts'
import type { CompleteChangeProposalRequest } from '@shared/helper-http'
import { parameterSnapshotsEqual, parameterValuesEqual } from '@shared/parameter-comparison'

import { atomicWriteJson } from './atomic-write'

interface ProposalDocument {
  readonly schemaVersion: 1
  readonly proposals: readonly ChangeProposalView[]
}

const EMPTY_DOCUMENT: ProposalDocument = { schemaVersion: 1, proposals: [] }
const MAX_INBOX_BYTES = 1024 * 1024
const INBOX_DIRECTORY = 'mcp-inbox'
const QUARANTINE_DIRECTORY = 'quarantine'

export interface InboxImportResult {
  readonly imported: number
  readonly quarantined: number
}

function isParameterValue(value: unknown, depth = 0): value is ParameterValue {
  if (depth > 4) return false
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return typeof value !== 'number' || Number.isFinite(value)
  }
  return Array.isArray(value) && value.every((item) => isParameterValue(item, depth + 1))
}

function isParameterSnapshot(value: unknown): value is ParameterSnapshot {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.entries(value).every(
      ([key, item]) => /^[A-Za-z0-9_]+$/u.test(key) && isParameterValue(item),
    )
  )
}

function snapshotsDescribeChange(before: ParameterSnapshot, after: ParameterSnapshot): boolean {
  const beforeKeys = Object.keys(before).sort()
  const afterKeys = Object.keys(after).sort()
  return (
    beforeKeys.length > 0 &&
    beforeKeys.length === afterKeys.length &&
    beforeKeys.every((key, index) => key === afterKeys[index]) &&
    beforeKeys.some((key) => !parameterValuesEqual(before[key]!, after[key]!))
  )
}

function snapshotsHaveSameKeys(left: ParameterSnapshot, right: ParameterSnapshot): boolean {
  const leftKeys = Object.keys(left).sort()
  const rightKeys = Object.keys(right).sort()
  return (
    leftKeys.length === rightKeys.length && leftKeys.every((key, index) => key === rightKeys[index])
  )
}

function isRollbackGuard(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const guard = value as Record<string, unknown>
  return (
    typeof guard.id === 'string' &&
    Boolean(guard.id) &&
    guard.id.length <= 256 &&
    typeof guard.validAtRevision === 'string' &&
    Boolean(guard.validAtRevision) &&
    guard.validAtRevision.length <= 256
  )
}

export function parseQueueChangeProposalRequest(value: unknown): QueueChangeProposalRequest | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const request = value as Record<string, unknown>
  const allowedKeys = new Set([
    'destination',
    'presetKind',
    'presetId',
    'newPresetName',
    'before',
    'after',
    'reason',
    'requestedRevision',
  ])
  if (
    Object.keys(request).some((key) => !allowedKeys.has(key)) ||
    (request.destination !== 'current-project' &&
      request.destination !== 'update-current-preset' &&
      request.destination !== 'save-as-new-preset') ||
    (request.presetKind !== 'machine' &&
      request.presetKind !== 'process' &&
      request.presetKind !== 'filament') ||
    typeof request.presetId !== 'string' ||
    !request.presetId ||
    typeof request.reason !== 'string' ||
    !request.reason.trim() ||
    request.reason.length > 2_000 ||
    typeof request.requestedRevision !== 'string' ||
    !request.requestedRevision ||
    request.requestedRevision.length > 256 ||
    !isParameterSnapshot(request.before) ||
    !isParameterSnapshot(request.after)
  ) {
    return null
  }
  if (!snapshotsDescribeChange(request.before, request.after)) {
    return null
  }
  const newPresetName =
    typeof request.newPresetName === 'string' ? request.newPresetName.trim() : null
  if (
    request.destination === 'save-as-new-preset' &&
    (!newPresetName || newPresetName.length > 256)
  ) {
    return null
  }
  if (request.destination !== 'save-as-new-preset' && request.newPresetName !== undefined) {
    return null
  }

  return {
    destination: request.destination,
    presetKind: request.presetKind,
    presetId: request.presetId,
    ...(request.destination === 'save-as-new-preset'
      ? { newPresetName: newPresetName as string }
      : {}),
    before: request.before,
    after: request.after,
    reason: request.reason.trim(),
    requestedRevision: request.requestedRevision,
  }
}

function isProposal(value: unknown): value is ChangeProposalView {
  if (typeof value !== 'object' || value === null) return false
  const proposal = value as Record<string, unknown>
  const destination = String(proposal.destination)
  const status = String(proposal.status)
  const before = proposal.before
  const after = proposal.after
  const currentValues = proposal.currentValues
  return (
    typeof proposal.id === 'string' &&
    Boolean(proposal.id) &&
    typeof proposal.createdAt === 'string' &&
    !Number.isNaN(Date.parse(proposal.createdAt)) &&
    typeof proposal.updatedAt === 'string' &&
    !Number.isNaN(Date.parse(proposal.updatedAt)) &&
    (proposal.approvedAt === null ||
      (typeof proposal.approvedAt === 'string' &&
        !Number.isNaN(Date.parse(proposal.approvedAt)))) &&
    ['current-project', 'update-current-preset', 'save-as-new-preset'].includes(destination) &&
    ['machine', 'process', 'filament'].includes(String(proposal.presetKind)) &&
    typeof proposal.presetId === 'string' &&
    Boolean(proposal.presetId) &&
    (destination === 'save-as-new-preset'
      ? typeof proposal.newPresetName === 'string' &&
        Boolean(proposal.newPresetName.trim()) &&
        proposal.newPresetName.length <= 256
      : proposal.newPresetName === null) &&
    isParameterSnapshot(before) &&
    isParameterSnapshot(after) &&
    snapshotsDescribeChange(before, after) &&
    typeof proposal.reason === 'string' &&
    Boolean(proposal.reason.trim()) &&
    proposal.reason.length <= 2_000 &&
    [
      'pending',
      'applied',
      'rejected',
      'failed',
      'partially-rolled-back',
      'changed-after-apply',
      'rolled-back',
    ].includes(status) &&
    (currentValues === undefined ||
      currentValues === null ||
      (isParameterSnapshot(currentValues) && snapshotsHaveSameKeys(before, currentValues))) &&
    (status === 'partially-rolled-back' || status === 'changed-after-apply'
      ? isParameterSnapshot(currentValues)
      : true) &&
    typeof proposal.requestedRevision === 'string' &&
    Boolean(proposal.requestedRevision) &&
    proposal.requestedRevision.length <= 256 &&
    (proposal.authoritativeRevision === null ||
      (typeof proposal.authoritativeRevision === 'string' &&
        Boolean(proposal.authoritativeRevision) &&
        proposal.authoritativeRevision.length <= 256)) &&
    (status === 'pending' ? proposal.authoritativeRevision === null : true) &&
    (status === 'applied' ||
    status === 'failed' ||
    status === 'partially-rolled-back' ||
    status === 'changed-after-apply' ||
    status === 'rolled-back'
      ? typeof proposal.authoritativeRevision === 'string'
      : true) &&
    (status === 'applied' ||
    status === 'failed' ||
    status === 'partially-rolled-back' ||
    status === 'changed-after-apply' ||
    status === 'rolled-back'
      ? typeof proposal.approvedAt === 'string'
      : true) &&
    (proposal.rollbackGuard === null ||
      (status === 'applied' && isRollbackGuard(proposal.rollbackGuard))) &&
    (proposal.error === null ||
      (typeof proposal.error === 'string' && proposal.error.length <= 2_000))
  )
}

export class ChangeProposalStore {
  private readonly filePath: string
  private readonly inboxPath: string
  private readonly quarantinePath: string

  public constructor(userDataPath: string) {
    this.filePath = join(userDataPath, 'change-proposals.json')
    this.inboxPath = join(userDataPath, INBOX_DIRECTORY)
    this.quarantinePath = join(this.inboxPath, QUARANTINE_DIRECTORY)
  }

  public async list(): Promise<readonly ChangeProposalView[]> {
    return (await this.read()).proposals
  }

  public async queue(request: QueueChangeProposalRequest): Promise<ChangeProposalView> {
    const parsed = parseQueueChangeProposalRequest(request)
    if (!parsed) throw new Error('invalid-change-proposal')
    return this.queueValidated(parsed)
  }

  public async importInbox(
    accept: (request: QueueChangeProposalRequest) => boolean | Promise<boolean>,
  ): Promise<InboxImportResult> {
    await mkdir(this.inboxPath, { recursive: true })
    const entries = await readdir(this.inboxPath, { withFileTypes: true })
    let imported = 0
    let quarantined = 0

    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (entry.name.endsWith('.tmp') || entry.name === QUARANTINE_DIRECTORY) continue
      const sourcePath = join(this.inboxPath, entry.name)
      const requestId = basename(entry.name, extname(entry.name))

      try {
        const fileStat = await lstat(sourcePath)
        if (
          !fileStat.isFile() ||
          fileStat.isSymbolicLink() ||
          extname(entry.name).toLowerCase() !== '.json' ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
            requestId,
          ) ||
          fileStat.size <= 0 ||
          fileStat.size > MAX_INBOX_BYTES
        ) {
          throw new Error('invalid-inbox-request')
        }
        const value: unknown = JSON.parse(
          (await readFile(sourcePath, 'utf8')).replace(/^\uFEFF/u, ''),
        )
        const request = parseQueueChangeProposalRequest(value)
        if (!request || !(await accept(request))) {
          throw new Error('invalid-inbox-request')
        }
        await this.queueValidated(request, requestId)
        await rm(sourcePath, { force: true })
        imported += 1
      } catch {
        await this.quarantine(sourcePath)
        quarantined += 1
      }
    }

    return { imported, quarantined }
  }

  public async approve(request: ApproveChangeProposalRequest): Promise<ChangeProposalView> {
    if (
      !request ||
      typeof request.id !== 'string' ||
      !request.id ||
      (request.destination !== 'current-project' &&
        request.destination !== 'update-current-preset' &&
        request.destination !== 'save-as-new-preset') ||
      (request.destination === 'save-as-new-preset' &&
        (typeof request.newPresetName !== 'string' ||
          !request.newPresetName.trim() ||
          request.newPresetName.length > 256)) ||
      (request.destination !== 'save-as-new-preset' && request.newPresetName !== undefined)
    ) {
      throw new Error('invalid-change-proposal')
    }
    const document = await this.read()
    const index = document.proposals.findIndex((proposal) => proposal.id === request.id)
    const existing = document.proposals[index]
    if (!existing) throw new Error('change-proposal-not-found')
    if (existing.status !== 'pending' || existing.approvedAt !== null) {
      throw new Error('invalid-change-proposal')
    }
    const now = new Date().toISOString()
    const updated: ChangeProposalView = {
      ...existing,
      updatedAt: now,
      approvedAt: now,
      destination: request.destination,
      newPresetName:
        request.destination === 'save-as-new-preset' ? request.newPresetName?.trim() || null : null,
    }
    const proposals = [...document.proposals]
    proposals[index] = updated
    await this.write({ schemaVersion: 1, proposals })
    return updated
  }

  private async queueValidated(
    request: QueueChangeProposalRequest,
    id: string = randomUUID(),
  ): Promise<ChangeProposalView> {
    const document = await this.read()
    const existing = document.proposals.find((proposal) => proposal.id === id)
    if (existing) {
      if (
        existing.destination === request.destination &&
        existing.presetId === request.presetId &&
        existing.presetKind === request.presetKind &&
        existing.newPresetName ===
          (request.destination === 'save-as-new-preset'
            ? request.newPresetName?.trim() || null
            : null) &&
        existing.reason === request.reason &&
        existing.requestedRevision === request.requestedRevision &&
        parameterSnapshotsEqual(existing.before, request.before) &&
        parameterSnapshotsEqual(existing.after, request.after)
      ) {
        return existing
      }
      throw new Error('invalid-change-proposal')
    }

    const now = new Date().toISOString()
    const proposal: ChangeProposalView = {
      id,
      createdAt: now,
      updatedAt: now,
      approvedAt: null,
      destination: request.destination,
      presetKind: request.presetKind,
      presetId: request.presetId,
      newPresetName:
        request.destination === 'save-as-new-preset' ? request.newPresetName?.trim() || null : null,
      before: request.before,
      after: request.after,
      currentValues: null,
      reason: request.reason.trim(),
      status: 'pending',
      requestedRevision: request.requestedRevision,
      authoritativeRevision: null,
      rollbackGuard: null,
      error: null,
    }
    await this.write({ schemaVersion: 1, proposals: [proposal, ...document.proposals] })
    return proposal
  }

  public async complete(request: CompleteChangeProposalRequest): Promise<ChangeProposalView> {
    if (!request || typeof request.id !== 'string' || !request.id) {
      throw new Error('invalid-authoritative-receipt')
    }
    const document = await this.read()
    const index = document.proposals.findIndex((proposal) => proposal.id === request.id)
    const existing = document.proposals[index]
    if (!existing) throw new Error('change-proposal-not-found')
    const receipt = request.receipt
    const completesPending =
      receipt?.status !== 'rolled-back' &&
      existing.status === 'pending' &&
      existing.approvedAt !== null
    const repeatsApplied = receipt?.status === 'applied' && existing.status === 'applied'
    const rollsBackApplied = receipt?.status === 'rolled-back' && existing.status === 'applied'
    if (
      receipt?.authority !== 'orca' ||
      !['applied', 'rejected', 'failed', 'rolled-back'].includes(receipt.status) ||
      typeof receipt.revision !== 'string' ||
      !receipt.revision ||
      !isParameterSnapshot(receipt.before) ||
      !isParameterSnapshot(receipt.after) ||
      (receipt.error !== undefined &&
        (typeof receipt.error !== 'string' || receipt.error.length > 2_000)) ||
      (receipt.rollbackGuard !== undefined && !isRollbackGuard(receipt.rollbackGuard)) ||
      (receipt.status !== 'applied' && receipt.rollbackGuard !== undefined) ||
      (!completesPending && !repeatsApplied && !rollsBackApplied)
    ) {
      throw new Error('invalid-authoritative-receipt')
    }
    if (
      !parameterSnapshotsEqual(receipt.before, existing.before) ||
      !parameterSnapshotsEqual(receipt.after, existing.after)
    ) {
      throw new Error('invalid-authoritative-receipt')
    }

    if (repeatsApplied) {
      if (
        receipt.revision !== existing.authoritativeRevision ||
        (existing.rollbackGuard !== null &&
          receipt.rollbackGuard !== undefined &&
          (receipt.rollbackGuard.id !== existing.rollbackGuard.id ||
            receipt.rollbackGuard.validAtRevision !== existing.rollbackGuard.validAtRevision))
      ) {
        throw new Error('invalid-authoritative-receipt')
      }
      if (existing.rollbackGuard !== null || receipt.rollbackGuard === undefined) return existing
    }

    const updated: ChangeProposalView = {
      ...existing,
      updatedAt: new Date().toISOString(),
      status: receipt.status,
      authoritativeRevision: receipt.revision,
      rollbackGuard: receipt.status === 'applied' ? (receipt.rollbackGuard ?? null) : null,
      currentValues: receipt.status === 'rolled-back' ? existing.before : null,
      error: receipt.error?.trim() || null,
    }
    const proposals = [...document.proposals]
    proposals[index] = updated
    await this.write({ schemaVersion: 1, proposals })
    return updated
  }

  public async reconcileNativeState(
    id: string,
    revision: string,
    currentValues: ParameterSnapshot,
  ): Promise<ChangeProposalView> {
    if (
      typeof id !== 'string' ||
      !id ||
      typeof revision !== 'string' ||
      !revision ||
      !isParameterSnapshot(currentValues)
    ) {
      throw new Error('invalid-authoritative-receipt')
    }
    const document = await this.read()
    const index = document.proposals.findIndex((proposal) => proposal.id === id)
    const existing = document.proposals[index]
    if (!existing) throw new Error('change-proposal-not-found')
    if (
      existing.approvedAt === null ||
      !['applied', 'partially-rolled-back', 'changed-after-apply', 'rolled-back'].includes(
        existing.status,
      ) ||
      !snapshotsHaveSameKeys(existing.before, currentValues)
    ) {
      throw new Error('invalid-authoritative-receipt')
    }

    const changedKeys = Object.keys(existing.after).filter(
      (key) => !parameterValuesEqual(existing.before[key]!, existing.after[key]!),
    )
    const restoredCount = changedKeys.filter((key) =>
      parameterValuesEqual(currentValues[key]!, existing.before[key]!),
    ).length
    const appliedCount = changedKeys.filter((key) =>
      parameterValuesEqual(currentValues[key]!, existing.after[key]!),
    ).length
    const status: ChangeProposalView['status'] =
      restoredCount === changedKeys.length
        ? 'rolled-back'
        : restoredCount > 0
          ? 'partially-rolled-back'
          : appliedCount === changedKeys.length
            ? 'applied'
            : 'changed-after-apply'

    if (
      existing.status === status &&
      existing.authoritativeRevision === revision &&
      existing.rollbackGuard === null &&
      existing.currentValues &&
      parameterSnapshotsEqual(existing.currentValues, currentValues)
    ) {
      return existing
    }

    const updated: ChangeProposalView = {
      ...existing,
      updatedAt: new Date().toISOString(),
      status,
      authoritativeRevision: revision,
      rollbackGuard: null,
      currentValues,
      error: null,
    }
    const proposals = [...document.proposals]
    proposals[index] = updated
    await this.write({ schemaVersion: 1, proposals })
    return updated
  }

  public async reject(id: string): Promise<ChangeProposalView> {
    const document = await this.read()
    const index = document.proposals.findIndex((proposal) => proposal.id === id)
    const existing = document.proposals[index]
    if (!existing) throw new Error('change-proposal-not-found')
    if (existing.status !== 'pending' || existing.approvedAt !== null) {
      throw new Error('invalid-change-proposal')
    }
    const updated: ChangeProposalView = {
      ...existing,
      updatedAt: new Date().toISOString(),
      status: 'rejected',
    }
    const proposals = [...document.proposals]
    proposals[index] = updated
    await this.write({ schemaVersion: 1, proposals })
    return updated
  }

  public async guardRollback(request: GuardProposalRollbackRequest): Promise<RollbackGuardResult> {
    if (
      !request ||
      typeof request.id !== 'string' ||
      !request.id ||
      typeof request.currentRevision !== 'string' ||
      !request.currentRevision ||
      !isParameterSnapshot(request.currentValues)
    ) {
      throw new Error('invalid-change-proposal')
    }
    const proposal = (await this.list()).find((candidate) => candidate.id === request.id)
    if (!proposal) throw new Error('change-proposal-not-found')
    if (proposal.status !== 'applied') {
      return { allowed: false, reason: 'not-applied', changes: null }
    }
    if (request.currentRevision !== proposal.authoritativeRevision) {
      return { allowed: false, reason: 'revision-mismatch', changes: null }
    }
    if (
      Object.keys(proposal.after).some(
        (key) =>
          !Object.prototype.hasOwnProperty.call(request.currentValues, key) ||
          !parameterValuesEqual(request.currentValues[key]!, proposal.after[key]!),
      )
    ) {
      return { allowed: false, reason: 'values-changed', changes: null }
    }
    return { allowed: true, reason: null, changes: proposal.before }
  }

  private async read(): Promise<ProposalDocument> {
    try {
      const value: unknown = JSON.parse(await readFile(this.filePath, 'utf8'))
      if (typeof value !== 'object' || value === null) return EMPTY_DOCUMENT
      const record = value as Record<string, unknown>
      if (record.schemaVersion !== 1 || !Array.isArray(record.proposals)) {
        return EMPTY_DOCUMENT
      }
      return {
        schemaVersion: 1,
        proposals: record.proposals.filter(isProposal),
      }
    } catch {
      return EMPTY_DOCUMENT
    }
  }

  private async write(document: ProposalDocument): Promise<void> {
    await atomicWriteJson(this.filePath, document)
  }

  private async quarantine(sourcePath: string): Promise<void> {
    await mkdir(this.quarantinePath, { recursive: true })
    const targetPath = join(this.quarantinePath, `${basename(sourcePath)}.${randomUUID()}.rejected`)
    await rename(sourcePath, targetPath).catch(async () => {
      await rm(sourcePath, { force: true, recursive: true }).catch(() => undefined)
    })
  }
}
