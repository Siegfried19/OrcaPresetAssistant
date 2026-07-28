import {
  AlertTriangle,
  CheckCircle2,
  FileJson2,
  GitCompareArrows,
  History,
  Link2,
  MousePointer2,
} from 'lucide-react'

import type { PresetView } from '@shared/contracts'

import { useI18n } from '../i18n/I18nProvider'
import { materialRoleTranslationKey, validationTranslationKey } from '../i18n/messages'
import { formatDate } from '../lib/format'
import { GitBadge, KindBadge, ResultBadge } from './Badges'

interface InspectorProps {
  readonly preset: PresetView | null
  readonly onShowDiff: (presetId: string) => void
  readonly onRecord: () => void
}

export function Inspector({ preset, onShowDiff, onRecord }: InspectorProps): React.JSX.Element {
  const { language, t } = useI18n()
  if (!preset) {
    return (
      <aside className="inspector inspector-empty">
        <span className="empty-icon">
          <MousePointer2 aria-hidden="true" size={23} strokeWidth={1.6} />
        </span>
        <strong>{t('inspector.chooseTitle')}</strong>
        <span>{t('inspector.chooseBody')}</span>
      </aside>
    )
  }

  return (
    <aside className="inspector">
      <div className="inspector-header">
        <div className="inspector-badges">
          <KindBadge kind={preset.kind} />
          <GitBadge state={preset.gitState} />
        </div>
        <h2>{preset.name}</h2>
        <p>{preset.relativePath}</p>
      </div>

      <div className="inspector-scroll">
        <section className="detail-section">
          <h3>{t('inspector.identity')}</h3>
          <dl className="detail-list">
            <div>
              <dt>
                <Link2 aria-hidden="true" size={15} />
                {t('inspector.inherits')}
              </dt>
              <dd>{preset.inherits || t('inspector.noParent')}</dd>
            </div>
            <div>
              <dt>
                <FileJson2 aria-hidden="true" size={15} />
                {t('inspector.settingsId')}
              </dt>
              <dd>{preset.settingsId || t('inspector.notRead')}</dd>
            </div>
            <div>
              <dt>
                <History aria-hidden="true" size={15} />
                {t('inspector.fileModified')}
              </dt>
              <dd>{formatDate(preset.modifiedAt, language, t)}</dd>
            </div>
          </dl>
        </section>

        <section className="detail-section">
          <div className="section-heading">
            <h3>{t('inspector.latestPrint')}</h3>
            {preset.latestPrint && (
              <ResultBadge
                currentVersion={preset.latestPrint.currentVersion}
                result={preset.latestPrint.result}
              />
            )}
          </div>
          {preset.latestPrint ? (
            <div className="evidence-card">
              <div className="evidence-date">
                {formatDate(preset.latestPrint.printedAt, language, t)}
              </div>
              <div className="evidence-materials">
                <span>
                  {t('inspector.materialComposition', {
                    count: preset.latestPrint.materials.length,
                  })}
                </span>
                <div>
                  {preset.latestPrint.materials.map((material, index) => (
                    <div className="evidence-material" key={`${material.name}-${index}`}>
                      <strong>{material.name}</strong>
                      <small>{t(materialRoleTranslationKey(material.role))}</small>
                    </div>
                  ))}
                </div>
              </div>
              <p>{preset.latestPrint.note || t('inspector.noNote')}</p>
              <div
                className={
                  preset.latestPrint.currentVersion
                    ? 'version-state is-current'
                    : 'version-state is-stale'
                }
              >
                {preset.latestPrint.currentVersion ? (
                  <CheckCircle2 aria-hidden="true" size={14} />
                ) : (
                  <AlertTriangle aria-hidden="true" size={14} />
                )}
                {preset.latestPrint.currentVersion
                  ? t('inspector.currentVersion')
                  : t('inspector.staleVersion')}
              </div>
            </div>
          ) : (
            <div className="evidence-empty">{t('inspector.noEvidence')}</div>
          )}
        </section>

        {preset.validationIssues.length > 0 && (
          <section className="detail-section">
            <h3>{t('inspector.validation')}</h3>
            <div className="validation-card">
              {preset.validationIssues.map((issue) => (
                <span key={issue}>
                  <AlertTriangle aria-hidden="true" size={14} />
                  {t(validationTranslationKey(issue))}
                </span>
              ))}
            </div>
          </section>
        )}
      </div>

      <div className="inspector-actions">
        <button
          className="secondary-button"
          disabled={preset.gitState === 'clean' || preset.gitState === 'unknown'}
          onClick={() => onShowDiff(preset.id)}
          type="button"
        >
          <GitCompareArrows aria-hidden="true" size={16} />
          {t('action.viewChanges')}
        </button>
        <button className="primary-button" onClick={onRecord} type="button">
          {t('action.recordPrint')}
        </button>
      </div>
    </aside>
  )
}
