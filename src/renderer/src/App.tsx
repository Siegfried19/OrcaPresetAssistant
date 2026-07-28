import {
  AlertCircle,
  Check,
  Command,
  Play,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import type { PresetDiff, PresetView } from '@shared/contracts'

import { DiffSheet } from './components/DiffSheet'
import { EmptyConnection } from './components/EmptyConnection'
import { Inspector } from './components/Inspector'
import { PresetList } from './components/PresetList'
import { RecordPrintSheet } from './components/RecordPrintSheet'
import { Sidebar } from './components/Sidebar'
import { useDashboard } from './hooks/use-dashboard'
import { useI18n } from './i18n/I18nProvider'
import { warningTranslationKey, type TranslationKey } from './i18n/messages'
import type { ViewFilter } from './types'

const FILTER_TITLE_KEYS: Record<ViewFilter, TranslationKey> = {
  all: 'filter.all',
  process: 'filter.process',
  filament: 'filter.filament',
  machine: 'filter.machine',
  changed: 'filter.changed',
  attention: 'filter.attention',
}

function matchesFilter(preset: PresetView, filter: ViewFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'changed') return ['new', 'modified', 'metadata'].includes(preset.gitState)
  if (filter === 'attention') return preset.validationIssues.length > 0
  return preset.kind === filter
}

export function App(): React.JSX.Element {
  const { language, setLanguage, t } = useI18n()
  const dashboard = useDashboard()
  const [filter, setFilter] = useState<ViewFilter>('all')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [recordOpen, setRecordOpen] = useState(false)
  const [diff, setDiff] = useState<PresetDiff | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const visiblePresets = useMemo(() => {
    if (!dashboard.snapshot) return []
    const locale = language === 'zh-CN' ? 'zh-CN' : 'en-US'
    const normalizedQuery = query.trim().toLocaleLowerCase(locale)
    return dashboard.snapshot.presets
      .filter((preset) => matchesFilter(preset, filter))
      .filter((preset) => {
        if (!normalizedQuery) return true
        return [preset.name, preset.inherits, preset.settingsId, preset.relativePath].some(
          (value) => value.toLocaleLowerCase(locale).includes(normalizedQuery),
        )
      })
      .sort((left, right) => {
        const priority = (preset: PresetView): number =>
          ['new', 'modified', 'metadata'].includes(preset.gitState) ? 0 : 1
        return priority(left) - priority(right) || left.name.localeCompare(right.name, locale)
      })
  }, [dashboard.snapshot, filter, language, query])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 2_800)
    return () => window.clearTimeout(timer)
  }, [toast])

  const effectiveSelectedId = visiblePresets.some((preset) => preset.id === selectedId)
    ? selectedId
    : (visiblePresets[0]?.id ?? null)
  const selectedPreset =
    dashboard.snapshot?.presets.find((preset) => preset.id === effectiveSelectedId) ?? null

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

  if (dashboard.loading || !dashboard.snapshot) {
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

  const snapshot = dashboard.snapshot

  return (
    <div className="app-frame">
      <header className="titlebar">
        <div className="titlebar-brand">
          <span className="app-mark compact">
            <SlidersHorizontal aria-hidden="true" size={17} strokeWidth={2} />
          </span>
          <span>Bambu Presets</span>
        </div>
        <div className="titlebar-state">
          <span className={snapshot.root.path ? 'status-dot is-online' : 'status-dot'} />
          {snapshot.root.path
            ? t('app.connected', { count: snapshot.stats.total })
            : t('app.waiting')}
        </div>
        <div aria-label={t('language.label')} className="language-switch" role="group">
          <button
            aria-pressed={language === 'zh-CN'}
            className={language === 'zh-CN' ? 'is-active' : ''}
            onClick={() => setLanguage('zh-CN')}
            title={t('language.zh')}
            type="button"
          >
            中
          </button>
          <button
            aria-pressed={language === 'en'}
            className={language === 'en' ? 'is-active' : ''}
            onClick={() => setLanguage('en')}
            title={t('language.en')}
            type="button"
          >
            EN
          </button>
        </div>
      </header>

      {!snapshot.root.path ? (
        <EmptyConnection onChooseRoot={() => void dashboard.chooseRoot()} />
      ) : (
        <div className="workspace">
          <Sidebar
            filter={filter}
            onChooseRoot={() => void dashboard.chooseRoot()}
            onFilterChange={setFilter}
            onOpenRoot={() => void dashboard.openRoot()}
            snapshot={snapshot}
          />

          <main className="main-panel">
            <div className="main-scroll">
              <section className="page-heading">
                <div>
                  <span className="eyebrow">{t('page.eyebrow')}</span>
                  <h1>{t(FILTER_TITLE_KEYS[filter])}</h1>
                  <p>{t('page.subtitle')}</p>
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
                    className="secondary-button elevated"
                    disabled={!snapshot.root.bambuExecutable}
                    onClick={() => void dashboard.launchBambu()}
                    type="button"
                  >
                    <Play aria-hidden="true" fill="currentColor" size={15} />
                    {t('action.openBambu')}
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
                  <span>{t('stat.changed')}</span>
                  <strong className={snapshot.stats.changed > 0 ? 'is-warm' : ''}>
                    {snapshot.stats.changed}
                  </strong>
                </div>
                <div>
                  <span>{t('stat.processFilament')}</span>
                  <strong>
                    {snapshot.stats.process}
                    <small> / {snapshot.stats.filament}</small>
                  </strong>
                </div>
                <div>
                  <span>{t('stat.attention')}</span>
                  <strong className={snapshot.stats.needsAttention > 0 ? 'is-danger' : ''}>
                    {snapshot.stats.needsAttention}
                  </strong>
                </div>
              </section>

              {snapshot.warnings.length > 0 && (
                <div className="warning-banner">
                  <AlertCircle aria-hidden="true" size={16} />
                  <span>{t(warningTranslationKey(snapshot.warnings[0]!))}</span>
                </div>
              )}

              <section className="library-card">
                <header className="library-toolbar">
                  <div>
                    <h2>{t(FILTER_TITLE_KEYS[filter])}</h2>
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
                <PresetList
                  onSelect={setSelectedId}
                  presets={visiblePresets}
                  selectedId={effectiveSelectedId}
                />
              </section>
            </div>
          </main>

          <Inspector
            onRecord={() => setRecordOpen(true)}
            onShowDiff={(presetId) => void showDiff(presetId)}
            preset={selectedPreset}
          />
        </div>
      )}

      {recordOpen && (
        <RecordPrintSheet
          onClose={() => setRecordOpen(false)}
          onSave={async (request) => {
            await dashboard.recordPrint(request)
            setToast(t('toast.recorded'))
          }}
          presets={snapshot.presets}
          selectedPreset={selectedPreset}
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
