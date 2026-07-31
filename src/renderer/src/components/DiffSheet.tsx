import { GitCompareArrows, X } from 'lucide-react'
import { useEffect } from 'react'

import type { PresetDiff } from '@shared/contracts'

import { useI18n } from '../i18n/I18nProvider'

interface DiffSheetProps {
  readonly diff: PresetDiff
  readonly onClose: () => void
}

export function DiffSheet({ diff, onClose }: DiffSheetProps): React.JSX.Element {
  const { t } = useI18n()

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const content =
    diff.state === 'clean'
      ? t('diff.clean')
      : diff.state === 'unknown'
        ? t('diff.unknown')
        : diff.state === 'new'
          ? `${t('diff.new')}\n\n${diff.content}`
          : diff.content || t('diff.empty')

  return (
    <div className="modal-backdrop" onMouseDown={onClose} role="presentation">
      <section
        aria-labelledby="diff-title"
        aria-modal="true"
        className="diff-sheet"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="sheet-header">
          <div>
            <span className="sheet-eyebrow">
              <GitCompareArrows aria-hidden="true" size={13} /> {t('diff.eyebrow')}
            </span>
            <h2 id="diff-title">{diff.title}</h2>
            <p>{t('diff.subtitle')}</p>
          </div>
          <button
            aria-label={t('action.close')}
            className="icon-button"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </header>
        <pre className="diff-content">{content}</pre>
      </section>
    </div>
  )
}
