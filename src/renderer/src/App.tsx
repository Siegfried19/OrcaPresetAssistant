import {
  AlertCircle,
  Check,
  CircleHelp,
  Command,
  Plus,
  RefreshCw,
  Search,
  Settings,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import type { PresetDiff, PresetVersionView, PresetView } from '@shared/contracts'

import { AiHelpSheet } from './components/AiHelpSheet'
import { DiffSheet } from './components/DiffSheet'
import { EmptyConnection } from './components/EmptyConnection'
import { Inspector } from './components/Inspector'
import { PresetList } from './components/PresetList'
import { PrintHistoryPage } from './components/PrintHistoryPage'
import { ProposalSummaryBanner } from './components/ProposalSummaryBanner'
import { RecordPrintSheet } from './components/RecordPrintSheet'
import { SaveVersionSheet } from './components/SaveVersionSheet'
import { SettingsSheet } from './components/SettingsSheet'
import { Sidebar } from './components/Sidebar'
import { VersionHistorySheet } from './components/VersionHistorySheet'
import { VersionStatusBar } from './components/VersionStatusBar'
import { useDashboard } from './hooks/use-dashboard'
import { useI18n } from './i18n/I18nProvider'
import { createTranslator, warningTranslationKey, type TranslationKey } from './i18n/messages'
import { proposalTargetName, resolveInspectorSelection } from './lib/inspector-selection'
import { latestProposal } from './lib/proposal-summary'
import type { PrimaryPage, ViewFilter } from './types'

const FILTER_LABEL_KEYS: Record<ViewFilter, TranslationKey> = {
  all: 'filter.all',
  process: 'filter.process',
  filament: 'filter.filament',
  machine: 'filter.machine',
}

function matchesFilter(preset: PresetView, filter: ViewFilter): boolean {
  if (filter === 'all') return true
  return preset.kind === filter
}

export function App(): React.JSX.Element {
  const { hostLanguage, language, setLanguage, t } = useI18n()
  const hostT = useMemo(() => createTranslator(hostLanguage), [hostLanguage])
  const dashboard = useDashboard()
  const [page, setPage] = useState<PrimaryPage>('user-presets')
  const [filter, setFilter] = useState<ViewFilter>('all')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedProposalId, setSelectedProposalId] = useState<string | null>(null)
  const [recordOpen, setRecordOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [saveVersionOpen, setSaveVersionOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [versions, setVersions] = useState<readonly PresetVersionView[]>([])
  const [diff, setDiff] = useState<PresetDiff | null>(null)
  const [showChanged, setShowChanged] = useState(false)
  const [versionBusy, setVersionBusy] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const showChangedOnly = showChanged && (dashboard.snapshot?.stats.changed ?? 0) > 0

  const visiblePresets = useMemo(() => {
    if (!dashboard.snapshot) return []
    const locale = language === 'zh-CN' ? 'zh-CN' : 'en-US'
    const normalizedQuery = query.trim().toLocaleLowerCase(locale)
    return dashboard.snapshot.presets
      .filter((preset) => matchesFilter(preset, filter))
      .filter(
        (preset) => !showChangedOnly || ['new', 'modified', 'metadata'].includes(preset.gitState),
      )
      .filter((preset) => {
        if (!normalizedQuery) return true
        return [preset.name, preset.inherits, preset.settingsId, preset.relativePath].some(
          (value) => value.toLocaleLowerCase(locale).includes(normalizedQuery),
        )
      })
      .sort((left, right) => left.name.localeCompare(right.name, locale))
  }, [dashboard.snapshot, filter, language, query, showChangedOnly])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 2_800)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    const savedLanguage = dashboard.snapshot?.settings.language
    if (savedLanguage && savedLanguage !== language) setLanguage(savedLanguage)
  }, [dashboard.snapshot?.settings.language, language, setLanguage])

  const changeProposals = dashboard.snapshot?.changeProposals ?? []
  const latestVisibleProposal = latestProposal(changeProposals)
  const {
    preset: selectedPreset,
    proposal: selectedProposal,
    proposalTargetName: selectedProposalTargetName,
  } = resolveInspectorSelection(visiblePresets, changeProposals, selectedId, selectedProposalId)
  const latestVisibleTargetName = latestVisibleProposal
    ? proposalTargetName(latestVisibleProposal, dashboard.snapshot?.presets ?? [])
    : null
  const refresh = async (): Promise<void> => {
    setRefreshing(true)
    try {
      await dashboard.refresh()
      setToast(t('toast.refreshed'))
    } catch {
      // The controller already exposes a user-facing error.
    } finally {
      setRefreshing(false)
    }
  }

  const showDiff = async (presetId: string): Promise<void> => {
    try {
      setDiff(await dashboard.getPresetDiff(presetId))
    } catch {
      // The controller already exposes a user-facing error.
    }
  }

  const initializePresetGit = async (): Promise<void> => {
    setVersionBusy(true)
    try {
      await dashboard.initializePresetGit()
      setToast(t('toast.versionEnabled'))
    } catch {
      // The controller already exposes a user-facing error.
    } finally {
      setVersionBusy(false)
    }
  }

  const openVersionHistory = async (): Promise<void> => {
    setHistoryOpen(true)
    setHistoryLoading(true)
    try {
      setVersions(await dashboard.listPresetVersions())
    } catch {
      setVersions([])
    } finally {
      setHistoryLoading(false)
    }
  }

  const changeLanguage = async (nextLanguage: 'zh-CN' | 'en'): Promise<void> => {
    try {
      await dashboard.updateSettings({ language: nextLanguage })
      setLanguage(nextLanguage)
    } catch {
      // The controller already exposes a user-facing error.
    }
  }

  if (dashboard.loading) {
    return (
      <div className="loading-screen">
        <span className="app-mark">
          <SlidersHorizontal aria-hidden="true" size={24} />
        </span>
        <div className="loading-ring" />
        <span>{t('app.loading')}</span>
      </div>
    )
  }

  if (!dashboard.snapshot) {
    return (
      <div className="loading-screen loading-screen-error" role="alert">
        <span className="loading-error-icon">
          <AlertCircle aria-hidden="true" size={24} />
        </span>
        <strong>{t('app.loadFailedTitle')}</strong>
        <span>{dashboard.error ?? t('app.loadFailedBody')}</span>
        <button
          className="primary-button"
          disabled={refreshing}
          onClick={() => void refresh()}
          type="button"
        >
          <RefreshCw aria-hidden="true" className={refreshing ? 'is-spinning' : ''} size={16} />
          {t('action.retry')}
        </button>
      </div>
    )
  }

  const snapshot = dashboard.snapshot

  return (
    <div className="app-frame">
      <header className="titlebar">
        <div className="titlebar-brand">
          <span className="app-mark compact">
            <SlidersHorizontal aria-hidden="true" size={17} strokeWidth={2} />
          </span>
          <span>{hostT('app.brand')}</span>
        </div>
        <div className="titlebar-state">
          <span className={snapshot.root.path ? 'status-dot is-online' : 'status-dot'} />
          {snapshot.root.path
            ? hostT('app.connected', { count: snapshot.stats.total })
            : hostT('app.waiting')}
        </div>
        <div className="titlebar-actions">
          <button
            aria-label={hostT('help.open')}
            className="titlebar-settings"
            onClick={() => setHelpOpen(true)}
            title={hostT('help.open')}
            type="button"
          >
            <CircleHelp aria-hidden="true" size={16} />
          </button>
          <button
            aria-label={hostT('settings.open')}
            className="titlebar-settings"
            onClick={() => setSettingsOpen(true)}
            title={hostT('settings.open')}
            type="button"
          >
            <Settings aria-hidden="true" size={16} />
          </button>
          <div aria-label={hostT('language.label')} className="language-switch" role="group">
            <button
              aria-pressed={language === 'zh-CN'}
              className={language === 'zh-CN' ? 'is-active' : ''}
              onClick={() => void changeLanguage('zh-CN')}
              title={hostT('language.zh')}
              type="button"
            >
              中
            </button>
            <button
              aria-pressed={language === 'en'}
              className={language === 'en' ? 'is-active' : ''}
              onClick={() => void changeLanguage('en')}
              title={hostT('language.en')}
              type="button"
            >
              EN
            </button>
          </div>
        </div>
      </header>

      {!snapshot.root.path ? (
        <EmptyConnection onChooseRoot={() => void dashboard.chooseRoot()} />
      ) : (
        <div className="workspace">
          <Sidebar
            onChooseRoot={() => void dashboard.chooseRoot()}
            onOpenRoot={() => void dashboard.openRoot()}
            onPageChange={(nextPage) => {
              setSelectedId(null)
              setSelectedProposalId(null)
              setPage(nextPage)
            }}
            page={page}
            snapshot={snapshot}
          />

          {page === 'user-presets' ? (
            <>
              <main className="main-panel">
                <div className="main-scroll">
                  <section className="page-heading">
                    <div>
                      <span className="eyebrow">{t('page.eyebrow')}</span>
                      <h1>{t('page.userPresets')}</h1>
                      <p>{t('page.userPresetsSubtitle')}</p>
                    </div>
                    <div className="heading-actions">
                      <button
                        aria-label={t('action.refresh')}
                        className="icon-button elevated"
                        disabled={refreshing}
                        onClick={() => void refresh()}
                        title={t('action.refresh')}
                        type="button"
                      >
                        <RefreshCw
                          aria-hidden="true"
                          className={refreshing ? 'is-spinning' : ''}
                          size={17}
                        />
                      </button>
                      <button
                        className="primary-button elevated"
                        onClick={() => setRecordOpen(true)}
                        type="button"
                      >
                        <Plus aria-hidden="true" size={17} />
                        {t('action.recordPrint')}
                      </button>
                    </div>
                  </section>

                  <section className="stat-strip" aria-label={t('stat.label')}>
                    <div>
                      <span>{t('stat.all')}</span>
                      <strong>{snapshot.stats.total}</strong>
                    </div>
                    <div>
                      <span>{t('stat.process')}</span>
                      <strong>{snapshot.stats.process}</strong>
                    </div>
                    <div>
                      <span>{t('stat.filament')}</span>
                      <strong>{snapshot.stats.filament}</strong>
                    </div>
                    <div>
                      <span>{t('stat.machine')}</span>
                      <strong>{snapshot.stats.machine}</strong>
                    </div>
                  </section>

                  {snapshot.warnings.length > 0 && (
                    <div className="warning-banner">
                      <AlertCircle aria-hidden="true" size={16} />
                      <span>{t(warningTranslationKey(snapshot.warnings[0]!))}</span>
                    </div>
                  )}

                  {latestVisibleProposal && latestVisibleTargetName && (
                    <ProposalSummaryBanner
                      onOpen={() => {
                        setPage('user-presets')
                        setFilter('all')
                        setQuery('')
                        setShowChanged(false)
                        setSelectedId(null)
                        setSelectedProposalId(latestVisibleProposal.id)
                      }}
                      proposal={latestVisibleProposal}
                      targetName={latestVisibleTargetName}
                      writeCapabilities={snapshot.writeCapabilities}
                    />
                  )}

                  <section className="library-card">
                    <header className="library-toolbar">
                      <div>
                        <h2>{t('page.userPresets')}</h2>
                        <span>{t('library.items', { count: visiblePresets.length })}</span>
                      </div>
                      <label className="search-field">
                        <Search aria-hidden="true" size={16} />
                        <input
                          aria-label={t('library.searchLabel')}
                          onChange={(event) => setQuery(event.target.value)}
                          placeholder={t('library.searchPlaceholder')}
                          value={query}
                        />
                        {query && (
                          <button
                            aria-label={t('library.clearSearch')}
                            onClick={() => setQuery('')}
                            type="button"
                          >
                            <X aria-hidden="true" size={14} />
                          </button>
                        )}
                        <kbd>
                          <Command aria-hidden="true" size={11} /> K
                        </kbd>
                      </label>
                    </header>
                    <VersionStatusBar
                      busy={versionBusy}
                      changedCount={snapshot.stats.changed}
                      onInitialize={() => void initializePresetGit()}
                      onOpenHistory={() => void openVersionHistory()}
                      onSave={() => setSaveVersionOpen(true)}
                      onToggleChanged={() => setShowChanged((current) => !current)}
                      root={snapshot.root}
                      showingChanged={showChangedOnly}
                    />
                    <div
                      aria-label={t('filter.label')}
                      className="preset-filter-tabs"
                      role="tablist"
                    >
                      {(Object.keys(FILTER_LABEL_KEYS) as ViewFilter[]).map((value) => (
                        <button
                          aria-selected={filter === value}
                          className={filter === value ? 'is-active' : ''}
                          key={value}
                          onClick={() => setFilter(value)}
                          role="tab"
                          type="button"
                        >
                          {t(FILTER_LABEL_KEYS[value])}
                        </button>
                      ))}
                    </div>
                    <PresetList
                      onSelect={(presetId) => {
                        setSelectedProposalId(null)
                        setSelectedId(presetId)
                      }}
                      presets={visiblePresets}
                      selectedId={selectedPreset?.id ?? null}
                    />
                  </section>
                </div>
              </main>

              {(selectedPreset || selectedProposal) && (
                <Inspector
                  onApproveProposal={async (request) => {
                    await dashboard.approveChangeProposal(request)
                    setToast(t('toast.proposalApproved'))
                  }}
                  onClose={() => {
                    setSelectedId(null)
                    setSelectedProposalId(null)
                  }}
                  onRecord={() => setRecordOpen(true)}
                  onRejectProposal={async (id) => {
                    await dashboard.rejectChangeProposal(id)
                    setToast(t('toast.proposalRejected'))
                  }}
                  onRollbackProposal={async (id) => {
                    await dashboard.rollbackChangeProposal(id)
                    setToast(t('toast.proposalRolledBack'))
                  }}
                  onShowDiff={(presetId) => void showDiff(presetId)}
                  preset={selectedPreset}
                  proposal={selectedProposal}
                  proposalTargetName={selectedProposalTargetName}
                  writeCapabilities={snapshot.writeCapabilities}
                />
              )}
            </>
          ) : (
            <PrintHistoryPage
              onDelete={async (id) => {
                await dashboard.deletePrintHistory(id)
                setToast(t('toast.printDeleted'))
              }}
              onOpenRecord={dashboard.openPrintHistoryRecord}
              onRecord={() => setRecordOpen(true)}
              onRefresh={() => void refresh()}
              onUpdate={async (request) => {
                await dashboard.updatePrintHistory(request)
                setToast(t('toast.printUpdated'))
              }}
              records={snapshot.printHistory}
              refreshing={refreshing}
            />
          )}
        </div>
      )}

      {recordOpen && (
        <RecordPrintSheet
          onClose={() => setRecordOpen(false)}
          onChooseProject3mf={dashboard.chooseProject3mf}
          onSave={async (request) => {
            await dashboard.recordPrint(request)
            setToast(t('toast.recorded'))
          }}
          presets={snapshot.presets}
          selectedPreset={selectedPreset}
          threeMfPolicy={snapshot.settings.threeMfPolicy}
        />
      )}
      {settingsOpen && (
        <SettingsSheet
          onClose={() => setSettingsOpen(false)}
          onSetLanguage={changeLanguage}
          onSetScope={dashboard.setCodexScope}
          onUpdate={dashboard.updateSettings}
          settings={snapshot.settings}
        />
      )}
      {helpOpen && <AiHelpSheet onClose={() => setHelpOpen(false)} />}
      {saveVersionOpen && (
        <SaveVersionSheet
          changedCount={snapshot.stats.changed}
          onClose={() => setSaveVersionOpen(false)}
          onSave={async (message) => {
            await dashboard.savePresetVersion(message)
            setShowChanged(false)
            setToast(t('toast.versionSaved'))
          }}
        />
      )}
      {historyOpen && (
        <VersionHistorySheet
          changedCount={snapshot.stats.changed}
          currentRevision={snapshot.root.latestPresetVersion?.revision ?? null}
          loading={historyLoading}
          onClose={() => setHistoryOpen(false)}
          onRestore={async (revision) => {
            await dashboard.restorePresetVersion(revision)
            setShowChanged(false)
            setToast(t('toast.versionRestored'))
          }}
          versions={versions}
        />
      )}
      {diff && <DiffSheet diff={diff} onClose={() => setDiff(null)} />}

      {dashboard.error && (
        <div className="toast is-error" role="alert">
          <AlertCircle aria-hidden="true" size={17} />
          <span>{dashboard.error}</span>
          <button aria-label={t('action.close')} onClick={dashboard.clearError} type="button">
            <X aria-hidden="true" size={14} />
          </button>
        </div>
      )}
      {toast && !dashboard.error && (
        <div className="toast" role="status">
          <Check aria-hidden="true" size={17} />
          <span>{toast}</span>
        </div>
      )}
    </div>
  )
}
