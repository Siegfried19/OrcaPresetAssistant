import { Save, X } from 'lucide-react'
import { useEffect, useState } from 'react'

import { useI18n } from '../i18n/I18nProvider'

interface SaveVersionSheetProps {
  readonly changedCount: number
  readonly onClose: () => void
  readonly onSave: (message: string) => Promise<void>
}

export function SaveVersionSheet({
  changedCount,
  onClose,
  onSave,
}: SaveVersionSheetProps): React.JSX.Element {
  const { t } = useI18n()
  const [message, setMessage] = useState(t('version.defaultMessage', { count: changedCount }))
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !saving) onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, saving])

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault()
    setSaving(true)
    setFailed(false)
    try {
      await onSave(message)
      onClose()
    } catch {
      setFailed(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose} role="presentation">
      <section
        aria-labelledby="save-version-title"
        aria-modal="true"
        className="save-version-sheet"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="sheet-header">
          <div>
            <span className="sheet-eyebrow">{t('version.eyebrow')}</span>
            <h2 id="save-version-title">{t('version.saveTitle')}</h2>
            <p>{t('version.saveBody', { count: changedCount })}</p>
          </div>
          <button
            aria-label={t('action.close')}
            className="icon-button"
            disabled={saving}
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </header>
        <form className="version-form" onSubmit={(event) => void submit(event)}>
          <label htmlFor="version-message">{t('version.message')}</label>
          <input
            autoFocus
            id="version-message"
            maxLength={120}
            onChange={(event) => setMessage(event.target.value)}
            value={message}
          />
          <small>{t('version.localOnly')}</small>
          {failed && <div className="form-error">{t('version.saveFailed')}</div>}
          <footer className="sheet-actions">
            <button className="secondary-button" disabled={saving} onClick={onClose} type="button">
              {t('action.cancel')}
            </button>
            <button className="primary-button" disabled={saving || !message.trim()} type="submit">
              <Save aria-hidden="true" size={16} />
              {saving ? t('version.saving') : t('version.save')}
            </button>
          </footer>
        </form>
      </section>
    </div>
  )
}
