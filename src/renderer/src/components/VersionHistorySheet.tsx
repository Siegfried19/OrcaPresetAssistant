import { AlertTriangle, GitCommitHorizontal, History, RotateCcw, X } from 'lucide-react'
import { useEffect, useState } from 'react'

import type { PresetVersionView } from '@shared/contracts'

import { useI18n } from '../i18n/I18nProvider'
import { formatDate } from '../lib/format'

interface VersionHistorySheetProps {
  readonly versions: readonly PresetVersionView[]
  readonly changedCount: number
  readonly currentRevision: string | null
  readonly loading: boolean
  readonly onClose: () => void
  readonly onRestore: (revision: string) => Promise<void>
}

export function VersionHistorySheet({
  versions,
  changedCount,
  currentRevision,
  loading,
  onClose,
  onRestore,
}: VersionHistorySheetProps): React.JSX.Element {
  const { language, t } = useI18n()
  const [pending, setPending] = useState<PresetVersionView | null>(null)
  const [restoring, setRestoring] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !restoring) onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, restoring])

  const restore = async (): Promise<void> => {
    if (!pending) return
    setRestoring(true)
    setFailed(false)
    try {
      await onRestore(pending.revision)
      onClose()
    } catch {
      setFailed(true)
    } finally {
      setRestoring(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose} role="presentation">
      <section
        aria-labelledby="version-history-title"
        aria-modal="true"
        className="version-history-sheet"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="sheet-header">
          <div>
            <span className="sheet-eyebrow">
              <History aria-hidden="true" size={13} /> {t('version.eyebrow')}
            </span>
            <h2 id="version-history-title">{t('version.historyTitle')}</h2>
            <p>{t('version.historyBody')}</p>
          </div>
          <button
            aria-label={t('action.close')}
            className="icon-button"
            disabled={restoring}
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </header>

        <div className="version-history-list">
          {loading ? (
            <div className="version-history-empty">{t('version.loadingHistory')}</div>
          ) : versions.length === 0 ? (
            <div className="version-history-empty">{t('version.emptyHistory')}</div>
          ) : (
            versions.map((version) => {
              const isCurrent = version.revision === currentRevision
              return (
                <div className="version-history-row" key={version.revision}>
                  <GitCommitHorizontal aria-hidden="true" size={17} />
                  <span>
                    <strong>{version.message}</strong>
                    <small>
                      {formatDate(version.createdAt, language, t)} · {version.shortRevision}
                    </small>
                  </span>
                  {isCurrent ? (
                    <span className="current-version-label">{t('version.current')}</span>
                  ) : (
                    <button
                      className="secondary-button compact"
                      disabled={changedCount > 0 || restoring}
                      onClick={() => {
                        setFailed(false)
                        setPending(version)
                      }}
                      type="button"
                    >
                      <RotateCcw aria-hidden="true" size={14} />
                      {t('version.restore')}
                    </button>
                  )}
                </div>
              )
            })
          )}
        </div>

        {changedCount > 0 && (
          <div className="history-warning">
            <AlertTriangle aria-hidden="true" size={15} />
            {t('version.saveBeforeRestore')}
          </div>
        )}

        {pending && (
          <div className="restore-confirmation">
            <div>
              <strong>{t('version.restoreConfirmTitle')}</strong>
              <p>{t('version.restoreConfirmBody', { message: pending.message })}</p>
            </div>
            {failed && <div className="form-error">{t('version.restoreFailed')}</div>}
            <div className="sheet-actions">
              <button
                className="secondary-button"
                disabled={restoring}
                onClick={() => setPending(null)}
                type="button"
              >
                {t('action.cancel')}
              </button>
              <button
                className="primary-button"
                disabled={restoring}
                onClick={() => void restore()}
                type="button"
              >
                <RotateCcw aria-hidden="true" size={15} />
                {restoring ? t('version.restoring') : t('version.confirmRestore')}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
