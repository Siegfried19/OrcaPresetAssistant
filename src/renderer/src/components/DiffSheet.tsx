import { Copy, X } from 'lucide-react'
import { useEffect, useState } from 'react'

import type { PresetDiff } from '@shared/contracts'

import { useI18n } from '../i18n/I18nProvider'

interface DiffSheetProps {
  readonly diff: PresetDiff
  readonly onClose: () => void
}

export function DiffSheet({ diff, onClose }: DiffSheetProps): React.JSX.Element {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)
  const diffContent =
    diff.state === 'clean'
      ? t('diff.clean')
      : diff.state === 'unknown'
        ? t('diff.unknown')
        : diff.state === 'new'
          ? `${t('diff.new')}\n\n${diff.content}`
          : diff.state === 'modified-empty'
            ? t('diff.empty')
            : diff.content

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [diff, onClose])

  const copy = async (): Promise<void> => {
    await navigator.clipboard.writeText(diffContent)
    setCopied(true)
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-labelledby="diff-title"
        aria-modal="true"
        className="diff-sheet"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="sheet-header">
          <div>
            <span className="sheet-eyebrow">GIT DIFF</span>
            <h2 id="diff-title">{diff.title}</h2>
            <p>{t('diff.subtitle')}</p>
          </div>
          <div className="sheet-header-actions">
            <button className="secondary-button compact" onClick={() => void copy()} type="button">
              <Copy aria-hidden="true" size={15} />
              {copied ? t('action.copied') : t('action.copy')}
            </button>
            <button
              aria-label={t('action.close')}
              className="icon-button"
              onClick={onClose}
              type="button"
            >
              <X aria-hidden="true" size={18} />
            </button>
          </div>
        </header>
        <pre className="diff-content">{diffContent}</pre>
      </section>
    </div>
  )
}
