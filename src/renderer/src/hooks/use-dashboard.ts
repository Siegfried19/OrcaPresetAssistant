import { useCallback, useEffect, useState } from 'react'

import type {
  ApproveChangeProposalRequest,
  ChangeProposalView,
  CodexPermissionScope,
  DashboardSnapshot,
  PresetDiff,
  PresetVersionView,
  RecordPrintRequest,
  UpdatePrintHistoryRequest,
  UpdateSettingsRequest,
} from '@shared/contracts'

import { getDashboardApi } from '../host/dashboard-host'
import { useI18n } from '../i18n/I18nProvider'
import { errorMessage } from '../lib/format'

interface DashboardController {
  readonly snapshot: DashboardSnapshot | null
  readonly loading: boolean
  readonly error: string | null
  clearError(): void
  refresh(): Promise<void>
  chooseRoot(): Promise<void>
  openRoot(): Promise<void>
  updateSettings(request: UpdateSettingsRequest): Promise<void>
  setCodexScope(scope: CodexPermissionScope): Promise<void>
  chooseCodexFileGrant(): Promise<void>
  revokeCodexFileGrant(path: string): Promise<void>
  chooseProject3mf(): Promise<string | null>
  recordPrint(request: RecordPrintRequest): Promise<void>
  updatePrintHistory(request: UpdatePrintHistoryRequest): Promise<void>
  openPrintHistoryRecord(id: string): Promise<void>
  deletePrintHistory(id: string): Promise<void>
  getPresetDiff(presetId: string): Promise<PresetDiff>
  initializePresetGit(): Promise<void>
  savePresetVersion(message: string): Promise<void>
  listPresetVersions(): Promise<readonly PresetVersionView[]>
  restorePresetVersion(revision: string): Promise<void>
  approveChangeProposal(request: ApproveChangeProposalRequest): Promise<ChangeProposalView>
  rejectChangeProposal(id: string): Promise<ChangeProposalView>
  rollbackChangeProposal(id: string): Promise<ChangeProposalView>
}

export function useDashboard(): DashboardController {
  const { language, t } = useI18n()
  const api = getDashboardApi()
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorSource, setErrorSource] = useState<unknown>(null)

  const perform = useCallback(async <T>(operation: () => Promise<T>): Promise<T> => {
    setErrorSource(null)
    try {
      return await operation()
    } catch (caught) {
      setErrorSource(caught)
      throw caught
    }
  }, [])

  const refresh = useCallback(async () => {
    const next = await perform(() => api.refresh())
    setSnapshot(next)
  }, [api, perform])

  const chooseRoot = useCallback(async () => {
    const next = await perform(() => api.chooseRoot(language))
    if (next) setSnapshot(next)
  }, [api, language, perform])

  const openRoot = useCallback(async () => {
    await perform(() => api.openRoot())
  }, [api, perform])

  const updateSettings = useCallback(
    async (request: UpdateSettingsRequest) => {
      const next = await perform(() => api.updateSettings(request))
      setSnapshot(next)
    },
    [api, perform],
  )

  const setCodexScope = useCallback(
    async (scope: CodexPermissionScope) => {
      const next = await perform(() => api.setCodexScope(scope))
      setSnapshot(next)
    },
    [api, perform],
  )

  const chooseCodexFileGrant = useCallback(async () => {
    const next = await perform(() => api.chooseCodexFileGrant(language))
    if (next) setSnapshot(next)
  }, [api, language, perform])

  const revokeCodexFileGrant = useCallback(
    async (path: string) => {
      const next = await perform(() => api.revokeCodexFileGrant(path))
      setSnapshot(next)
    },
    [api, perform],
  )

  const chooseProject3mf = useCallback(
    () => perform(() => api.chooseProject3mf(language)),
    [api, language, perform],
  )

  const recordPrint = useCallback(
    async (request: RecordPrintRequest) => {
      const next = await perform(() => api.recordPrint(request))
      setSnapshot(next)
    },
    [api, perform],
  )

  const updatePrintHistory = useCallback(
    async (request: UpdatePrintHistoryRequest) => {
      const next = await perform(() => api.updatePrintHistory(request))
      setSnapshot(next)
    },
    [api, perform],
  )

  const openPrintHistoryRecord = useCallback(
    async (id: string) => {
      await perform(() => api.openPrintHistoryRecord(id))
    },
    [api, perform],
  )

  const deletePrintHistory = useCallback(
    async (id: string) => {
      const next = await perform(() => api.deletePrintHistory(id))
      setSnapshot(next)
    },
    [api, perform],
  )

  const getPresetDiff = useCallback(
    (presetId: string) => perform(() => api.getPresetDiff(presetId)),
    [api, perform],
  )

  const initializePresetGit = useCallback(async () => {
    const next = await perform(() => api.initializePresetGit())
    setSnapshot(next)
  }, [api, perform])

  const savePresetVersion = useCallback(
    async (message: string) => {
      const next = await perform(() => api.savePresetVersion({ message }))
      setSnapshot(next)
    },
    [api, perform],
  )

  const listPresetVersions = useCallback(
    () => perform(() => api.listPresetVersions()),
    [api, perform],
  )

  const restorePresetVersion = useCallback(
    async (revision: string) => {
      const next = await perform(() => api.restorePresetVersion({ revision }))
      setSnapshot(next)
    },
    [api, perform],
  )

  const approveChangeProposal = useCallback(
    async (request: ApproveChangeProposalRequest) => {
      const proposal = await perform(() => api.approveChangeProposal(request))
      const next = await perform(() => api.refresh())
      setSnapshot(next)
      return proposal
    },
    [api, perform],
  )

  const rejectChangeProposal = useCallback(
    async (id: string) => {
      const proposal = await perform(() => api.rejectChangeProposal(id))
      const next = await perform(() => api.refresh())
      setSnapshot(next)
      return proposal
    },
    [api, perform],
  )

  const rollbackChangeProposal = useCallback(
    async (id: string) => {
      const proposal = await perform(() => api.rollbackChangeProposal(id))
      const next = await perform(() => api.refresh())
      setSnapshot(next)
      return proposal
    },
    [api, perform],
  )

  useEffect(() => {
    let active = true
    void api
      .getSnapshot()
      .then((next) => {
        if (active) setSnapshot(next)
      })
      .catch((caught: unknown) => {
        if (active) setErrorSource(caught)
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    const unsubscribe = api.onSnapshotChanged((next) => {
      if (active) setSnapshot(next)
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [api])

  return {
    snapshot,
    loading,
    error: errorSource ? errorMessage(errorSource, t) : null,
    clearError: () => setErrorSource(null),
    refresh,
    chooseRoot,
    openRoot,
    updateSettings,
    setCodexScope,
    chooseCodexFileGrant,
    revokeCodexFileGrant,
    chooseProject3mf,
    recordPrint,
    updatePrintHistory,
    openPrintHistoryRecord,
    deletePrintHistory,
    getPresetDiff,
    initializePresetGit,
    savePresetVersion,
    listPresetVersions,
    restorePresetVersion,
    approveChangeProposal,
    rejectChangeProposal,
    rollbackChangeProposal,
  }
}
