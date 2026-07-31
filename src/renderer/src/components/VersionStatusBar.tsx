import { CircleCheck, CircleDashed, GitCompareArrows, History, Save } from 'lucide-react'

import type { RootView } from '@shared/contracts'

import { useI18n } from '../i18n/I18nProvider'
import { formatDate } from '../lib/format'

interface VersionStatusBarProps {
  readonly root: RootView
  readonly changedCount: number
  readonly showingChanged: boolean
  readonly busy: boolean
  readonly onInitialize: () => void
  readonly onToggleChanged: () => void
  readonly onOpenHistory: () => void
  readonly onSave: () => void
}

export function VersionStatusBar({
  root,
  changedCount,
  showingChanged,
  busy,
  onInitialize,
  onToggleChanged,
  onOpenHistory,
  onSave,
}: VersionStatusBarProps): React.JSX.Element {
  const { language, t } = useI18n()

  if (!root.isGitRepository) {
    return (
      <div className="version-toolbar is-uninitialized">
        <div className="version-toolbar-copy">
          <CircleDashed aria-hidden="true" size={16} />
          <span>
            <strong>{t('version.notEnabled')}</strong>
            <small>{t('version.notEnabledBody')}</small>
          </span>
        </div>
        <button className="primary-button" disabled={busy} onClick={onInitialize} type="button">
          {busy ? t('version.enabling') : t('version.enable')}
        </button>
      </div>
    )
  }

  const latest = root.latestPresetVersion
  return (
    <div className={`version-toolbar ${changedCount > 0 ? 'has-changes' : 'is-clean'}`}>
      <div className="version-toolbar-copy">
        {changedCount > 0 ? (
          <span className="version-status-dot" />
        ) : (
          <CircleCheck aria-hidden="true" size={16} />
        )}
        <span>
          <strong>
            {changedCount > 0
              ? t('version.changedCount', { count: changedCount })
              : t('version.allSaved')}
          </strong>
          <small>
            {latest
              ? t('version.latest', {
                  date: formatDate(latest.createdAt, language, t),
                  message: latest.message,
                })
              : t('version.noInitialVersion')}
          </small>
        </span>
      </div>
      <div className="version-toolbar-actions">
        {changedCount > 0 && (
          <button
            aria-pressed={showingChanged}
            className={`secondary-button compact ${showingChanged ? 'is-active' : ''}`}
            onClick={onToggleChanged}
            type="button"
          >
            <GitCompareArrows aria-hidden="true" size={15} />
            {showingChanged ? t('version.showAll') : t('action.viewChanges')}
          </button>
        )}
        <button className="secondary-button compact" onClick={onOpenHistory} type="button">
          <History aria-hidden="true" size={15} />
          {t('version.history')}
        </button>
        <button
          className="primary-button"
          disabled={busy || changedCount === 0}
          onClick={onSave}
          type="button"
        >
          <Save aria-hidden="true" size={15} />
          {t('version.save')}
        </button>
      </div>
    </div>
  )
}
