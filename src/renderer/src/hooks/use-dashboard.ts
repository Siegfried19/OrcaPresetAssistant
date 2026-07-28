import { useCallback, useEffect, useState } from 'react'

import type { DashboardSnapshot, PresetDiff, RecordPrintRequest } from '@shared/contracts'

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
  launchBambu(): Promise<void>
  recordPrint(request: RecordPrintRequest): Promise<void>
  getPresetDiff(presetId: string): Promise<PresetDiff>
}

export function useDashboard(): DashboardController {
  const { language, t } = useI18n()
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
    const next = await perform(() => window.dashboard.refresh())
    setSnapshot(next)
  }, [perform])

  const chooseRoot = useCallback(async () => {
    const next = await perform(() => window.dashboard.chooseRoot(language))
    if (next) setSnapshot(next)
  }, [language, perform])

  const openRoot = useCallback(async () => {
    await perform(() => window.dashboard.openRoot())
  }, [perform])

  const launchBambu = useCallback(async () => {
    await perform(() => window.dashboard.launchBambu())
  }, [perform])

  const recordPrint = useCallback(
    async (request: RecordPrintRequest) => {
      const next = await perform(() => window.dashboard.recordPrint(request))
      setSnapshot(next)
    },
    [perform],
  )

  const getPresetDiff = useCallback(
    (presetId: string) => perform(() => window.dashboard.getPresetDiff(presetId)),
    [perform],
  )

  useEffect(() => {
    let active = true
    void window.dashboard
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

    const unsubscribe = window.dashboard.onSnapshotChanged((next) => {
      if (active) setSnapshot(next)
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  return {
    snapshot,
    loading,
    error: errorSource ? errorMessage(errorSource, t) : null,
    clearError: () => setErrorSource(null),
    refresh,
    chooseRoot,
    openRoot,
    launchBambu,
    recordPrint,
    getPresetDiff,
  }
}
