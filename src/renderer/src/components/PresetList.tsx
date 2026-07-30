import { ChevronRight, SearchX } from 'lucide-react'

import type { PresetView } from '@shared/contracts'

import { useI18n } from '../i18n/I18nProvider'
import { formatDate } from '../lib/format'
import { KindBadge, OriginBadge, ResultBadge } from './Badges'

interface PresetListProps {
  readonly presets: readonly PresetView[]
  readonly selectedId: string | null
  readonly onSelect: (id: string) => void
}

export function PresetList({ presets, selectedId, onSelect }: PresetListProps): React.JSX.Element {
  const { language, t } = useI18n()
  if (presets.length === 0) {
    return (
      <div className="list-empty">
        <span className="empty-icon">
          <SearchX aria-hidden="true" size={23} strokeWidth={1.6} />
        </span>
        <strong>{t('list.emptyTitle')}</strong>
        <span>{t('list.emptyBody')}</span>
      </div>
    )
  }

  return (
    <div className="preset-list" role="listbox" aria-label={t('list.label')}>
      <div className="list-columns" aria-hidden="true">
        <span>{t('list.preset')}</span>
        <span>{t('list.typeAndParent')}</span>
        <span>{t('list.latestPrint')}</span>
        <span />
      </div>
      {presets.map((preset) => (
        <button
          aria-selected={preset.id === selectedId}
          className={`preset-row ${preset.id === selectedId ? 'is-selected' : ''}`}
          key={preset.id}
          onClick={() => onSelect(preset.id)}
          role="option"
          type="button"
        >
          <span className="preset-primary">
            <span className="preset-copy">
              <strong>{preset.name}</strong>
              <small>{preset.relativePath}</small>
            </span>
          </span>
          <span className="preset-meta">
            <span className="preset-meta-badges">
              <KindBadge kind={preset.kind} />
              <OriginBadge origin={preset.origin} />
            </span>
            <small>
              {preset.inherits ? t('list.inherits', { name: preset.inherits }) : t('list.noParent')}
            </small>
          </span>
          <span className="preset-print">
            {preset.latestPrint ? (
              <>
                <ResultBadge
                  currentVersion={preset.latestPrint.currentVersion}
                  result={preset.latestPrint.result}
                />
                <small>{formatDate(preset.latestPrint.printedAt, language, t)}</small>
              </>
            ) : (
              <>
                <span className="never-printed">{t('list.neverPrinted')}</span>
                <small>{t('list.awaitingFirst')}</small>
              </>
            )}
          </span>
          <ChevronRight aria-hidden="true" className="row-chevron" size={16} />
        </button>
      ))}
    </div>
  )
}
