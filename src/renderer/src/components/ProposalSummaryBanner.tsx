import { ArrowRight, Bot, ChevronRight } from 'lucide-react'

import type { ChangeProposalView, OrcaWriteCapabilities } from '@shared/contracts'

import { useI18n } from '../i18n/I18nProvider'
import type { TranslationKey } from '../i18n/messages'
import { parameterCapability } from '../lib/parameter-capabilities'
import { proposalDisplayChange } from '../lib/proposal-summary'

interface ProposalSummaryBannerProps {
  readonly proposal: ChangeProposalView
  readonly targetName: string
  readonly writeCapabilities: OrcaWriteCapabilities | null
  readonly onOpen: () => void
}

function valueText(value: unknown): string {
  return value === null ? 'null' : typeof value === 'string' ? value : JSON.stringify(value)
}

export function ProposalSummaryBanner({
  proposal,
  targetName,
  writeCapabilities,
  onOpen,
}: ProposalSummaryBannerProps): React.JSX.Element {
  const { t } = useI18n()
  const displayChange = proposalDisplayChange(proposal)
  const keys = Array.from(
    new Set([...Object.keys(displayChange.before), ...Object.keys(displayChange.after)]),
  )
  const awaitingOrca = proposal.status === 'pending' && proposal.approvedAt !== null
  const statusKey: TranslationKey = awaitingOrca
    ? 'proposal.status.awaiting-orca'
    : `proposal.status.${proposal.status}`
  const statusClass = awaitingOrca ? 'awaiting-orca' : proposal.status
  const titleKey: TranslationKey = awaitingOrca
    ? 'proposal.notice.awaitingTitle'
    : proposal.status === 'applied'
      ? 'proposal.notice.appliedTitle'
      : proposal.status === 'rolled-back'
        ? 'proposal.notice.rolledBackTitle'
        : proposal.status === 'partially-rolled-back'
          ? 'proposal.notice.partiallyRolledBackTitle'
          : proposal.status === 'changed-after-apply'
            ? 'proposal.notice.changedAfterApplyTitle'
            : proposal.status === 'rejected'
              ? 'proposal.notice.rejectedTitle'
              : proposal.status === 'failed'
                ? 'proposal.notice.failedTitle'
                : 'proposal.notice.pendingTitle'

  return (
    <section className={`proposal-summary-banner proposal-summary-${statusClass}`}>
      <div className="proposal-summary-heading">
        <span className="proposal-summary-icon">
          <Bot aria-hidden="true" size={18} />
        </span>
        <div>
          <span className="eyebrow">{t('proposal.title')}</span>
          <h2>{t(titleKey)}</h2>
          <p>
            <strong>{targetName}</strong>
            <span>{t('proposal.notice.count', { count: keys.length })}</span>
          </p>
        </div>
        <span className={`proposal-status proposal-status-${statusClass}`}>{t(statusKey)}</span>
      </div>

      <div className="proposal-summary-diff" aria-label={t('proposal.notice.changesLabel')}>
        {keys.map((key) => (
          <div className="proposal-summary-row" key={key}>
            <span className="proposal-summary-parameter">
              <code>{key}</code>
              {parameterCapability(writeCapabilities, proposal.presetKind, key)?.panelVisibility ===
                'hidden' && (
                <small className="parameter-visibility-hidden">
                  {t('proposal.parameter.hidden')}
                </small>
              )}
            </span>
            <span>{valueText(displayChange.before[key])}</span>
            <ArrowRight aria-hidden="true" size={12} />
            <span>{valueText(displayChange.after[key])}</span>
          </div>
        ))}
      </div>

      <div className="proposal-summary-footer">
        <p>{proposal.reason}</p>
        <button className="secondary-button" onClick={onOpen} type="button">
          {t('proposal.notice.open')}
          <ChevronRight aria-hidden="true" size={15} />
        </button>
      </div>
    </section>
  )
}
