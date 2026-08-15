import {
  AlertTriangle,
  BadgeInfo,
  CheckCircle2,
  FileJson2,
  GitCompareArrows,
  History,
  Link2,
  MousePointer2,
  X,
} from 'lucide-react'

import type {
  ApproveChangeProposalRequest,
  ChangeProposalView,
  OrcaWriteCapabilities,
  PresetView,
} from '@shared/contracts'

import { useI18n } from '../i18n/I18nProvider'
import { materialRoleTranslationKey, validationTranslationKey } from '../i18n/messages'
import { formatDate, formatGitSummary } from '../lib/format'
import { GitBadge, KindBadge, OriginBadge, ResultBadge } from './Badges'
import { ChangeProposalCard } from './ChangeProposalCard'

interface InspectorProps {
  readonly preset: PresetView | null
  readonly proposal: ChangeProposalView | null
  readonly proposalTargetName: string | null
  readonly writeCapabilities: OrcaWriteCapabilities | null
  readonly onClose: () => void
  readonly onRecord: () => void
  readonly onShowDiff: (presetId: string) => void
  readonly onApproveProposal: (request: ApproveChangeProposalRequest) => Promise<void>
  readonly onRejectProposal: (id: string) => Promise<void>
  readonly onRollbackProposal: (id: string) => Promise<void>
}

export function Inspector({
  preset,
  proposal,
  proposalTargetName,
  writeCapabilities,
  onClose,
  onRecord,
  onShowDiff,
  onApproveProposal,
  onRejectProposal,
  onRollbackProposal,
}: InspectorProps): React.JSX.Element {
  const { language, t } = useI18n()
  if (!preset && proposal) {
    return (
      <aside className="inspector">
        <div className="inspector-header">
          <button
            aria-label={t('action.close')}
            className="inspector-close"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" size={17} />
          </button>
          <span className="eyebrow">{t('proposal.title')}</span>
          <h2>{proposalTargetName ?? proposal.presetId}</h2>
          <p>{proposal.presetId}</p>
        </div>
        <div className="inspector-scroll">
          <ChangeProposalCard
            key={proposal.id}
            onApprove={onApproveProposal}
            onReject={onRejectProposal}
            onRollback={onRollbackProposal}
            proposal={proposal}
            targetName={proposalTargetName}
            writeCapabilities={writeCapabilities}
          />
        </div>
      </aside>
    )
  }
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
        <button
          aria-label={t('action.close')}
          className="inspector-close"
          onClick={onClose}
          type="button"
        >
          <X aria-hidden="true" size={17} />
        </button>
        <div className="inspector-badges">
          <KindBadge kind={preset.kind} />
          <OriginBadge origin={preset.origin} />
          <GitBadge state={preset.gitState} />
        </div>
        <h2>{preset.name}</h2>
        <p>{preset.relativePath}</p>
      </div>

      <div className="inspector-scroll">
        {preset.kind === 'machine' && (
          <div className="warning-banner machine-read-only">
            <AlertTriangle aria-hidden="true" size={15} />
            <span>{t('inspector.machineReadOnly')}</span>
          </div>
        )}
        <section className="detail-section">
          <h3>{t('inspector.identity')}</h3>
          <dl className="detail-list">
            <div>
              <dt>
                <BadgeInfo aria-hidden="true" size={15} />
                {t('inspector.origin')}
              </dt>
              <dd title={t(`origin.${preset.origin}.detail`)}>{t(`origin.${preset.origin}`)}</dd>
            </div>
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
            <h3>{t('inspector.version')}</h3>
            <GitBadge state={preset.gitState} />
          </div>
          <p className="version-summary">{formatGitSummary(preset, t)}</p>
          {preset.gitState !== 'clean' && preset.gitState !== 'unknown' && (
            <button
              className="secondary-button compact"
              onClick={() => onShowDiff(preset.id)}
              type="button"
            >
              <GitCompareArrows aria-hidden="true" size={15} />
              {t('action.viewChanges')}
            </button>
          )}
        </section>

        <ChangeProposalCard
          key={proposal?.id ?? 'empty-proposal'}
          onApprove={onApproveProposal}
          onReject={onRejectProposal}
          onRollback={onRollbackProposal}
          proposal={proposal}
          targetName={proposalTargetName}
          writeCapabilities={writeCapabilities}
        />

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
        <button className="primary-button" onClick={onRecord} type="button">
          {t('action.recordPrint')}
        </button>
      </div>
    </aside>
  )
}
