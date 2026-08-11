import { ArrowRight, Bot, Check, CheckCircle2, Clock3, RotateCcw, X } from 'lucide-react'
import { useMemo, useState } from 'react'

import type {
  ApproveChangeProposalRequest,
  ChangeDestination,
  ChangeProposalView,
  OrcaWriteCapabilities,
} from '@shared/contracts'

import { useI18n } from '../i18n/I18nProvider'
import type { TranslationKey } from '../i18n/messages'
import { parameterCapability } from '../lib/parameter-capabilities'
import { proposalDisplayChange } from '../lib/proposal-summary'

interface ChangeProposalCardProps {
  readonly proposal: ChangeProposalView | null
  readonly targetName: string | null
  readonly writeCapabilities: OrcaWriteCapabilities | null
  readonly onApprove: (request: ApproveChangeProposalRequest) => Promise<void>
  readonly onReject: (id: string) => Promise<void>
  readonly onRollback: (id: string) => Promise<void>
}

const DESTINATIONS: readonly ChangeDestination[] = [
  'current-project',
  'update-current-preset',
  'save-as-new-preset',
]

function valueText(value: unknown): string {
  return value === null ? 'null' : typeof value === 'string' ? value : JSON.stringify(value)
}

export function ChangeProposalCard({
  proposal,
  targetName,
  writeCapabilities,
  onApprove,
  onReject,
  onRollback,
}: ChangeProposalCardProps): React.JSX.Element {
  const { t } = useI18n()
  const [destination, setDestination] = useState<ChangeDestination>(
    proposal?.destination ?? 'current-project',
  )
  const [newPresetName, setNewPresetName] = useState(proposal?.newPresetName ?? '')
  const [pendingAction, setPendingAction] = useState<'approve' | 'reject' | 'rollback' | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const displayChange = useMemo(
    () => (proposal ? proposalDisplayChange(proposal) : null),
    [proposal],
  )
  const keys = useMemo(() => {
    if (!displayChange) return []
    return Array.from(
      new Set([...Object.keys(displayChange.before), ...Object.keys(displayChange.after)]),
    )
  }, [displayChange])

  if (!proposal) {
    return (
      <section className="detail-section">
        <h3>{t('proposal.title')}</h3>
        <div className="proposal-empty">
          <Bot aria-hidden="true" size={18} />
          <span>{t('proposal.empty')}</span>
        </div>
      </section>
    )
  }
  const visibleChange = displayChange ?? { before: proposal.before, after: proposal.after }

  const approve = async (): Promise<void> => {
    if (destination === 'save-as-new-preset' && !newPresetName.trim()) {
      setFormError(t('proposal.nameRequired'))
      return
    }
    setPendingAction('approve')
    setFormError(null)
    try {
      await onApprove({
        id: proposal.id,
        destination,
        ...(destination === 'save-as-new-preset' ? { newPresetName: newPresetName.trim() } : {}),
      })
    } catch {
      setFormError(t('proposal.approveFailed'))
    } finally {
      setPendingAction(null)
    }
  }

  const reject = async (): Promise<void> => {
    setPendingAction('reject')
    setFormError(null)
    try {
      await onReject(proposal.id)
    } catch {
      setFormError(t('proposal.rejectFailed'))
    } finally {
      setPendingAction(null)
    }
  }

  const rollback = async (): Promise<void> => {
    setPendingAction('rollback')
    setFormError(null)
    try {
      await onRollback(proposal.id)
    } catch {
      setFormError(t('proposal.rollbackFailed'))
    } finally {
      setPendingAction(null)
    }
  }

  const awaitingApproval = proposal.status === 'pending' && proposal.approvedAt === null
  const awaitingOrca = proposal.status === 'pending' && proposal.approvedAt !== null
  const statusKey: TranslationKey = awaitingOrca
    ? 'proposal.status.awaiting-orca'
    : `proposal.status.${proposal.status}`
  const statusClass = awaitingOrca ? 'awaiting-orca' : proposal.status
  const nativeStateKey: TranslationKey | null = proposal.currentValues
    ? proposal.status === 'partially-rolled-back'
      ? 'proposal.nativeState.partiallyRolledBack'
      : proposal.status === 'changed-after-apply'
        ? 'proposal.nativeState.changedAfterApply'
        : proposal.status === 'rolled-back'
          ? 'proposal.nativeState.rolledBack'
          : proposal.status === 'applied' && !proposal.rollbackGuard
            ? 'proposal.nativeState.rollbackMovedToOrca'
            : null
    : null

  return (
    <section className="detail-section">
      <div className="section-heading">
        <h3>{t('proposal.title')}</h3>
        <span className={`proposal-status proposal-status-${statusClass}`}>{t(statusKey)}</span>
      </div>
      <div className="proposal-card">
        <div className="proposal-target">
          <strong>{t('proposal.target')}</strong>
          <span>{targetName ?? proposal.presetId}</span>
          <code>{proposal.presetId}</code>
        </div>
        <div className="proposal-reason">
          <strong>{t('proposal.reason')}</strong>
          <p>{proposal.reason}</p>
        </div>
        <div className="proposal-diff">
          <div className="proposal-diff-heading">
            <span>{t('proposal.parameter')}</span>
            <span>{t('proposal.before')}</span>
            <span>{t('proposal.after')}</span>
          </div>
          {keys.map((key) => {
            const capability = parameterCapability(writeCapabilities, proposal.presetKind, key)
            return (
              <div className="proposal-diff-row" key={key}>
                <div className="proposal-parameter-name">
                  <span>{capability?.displayLabel ?? key}</span>
                  <code>{key}</code>
                  {capability?.panelVisibility === 'hidden' && (
                    <small className="parameter-visibility-hidden">
                      {t('proposal.parameter.hidden')}
                    </small>
                  )}
                </div>
                <span>{valueText(visibleChange.before[key])}</span>
                <ArrowRight aria-hidden="true" size={12} />
                <span>{valueText(visibleChange.after[key])}</span>
              </div>
            )
          })}
        </div>

        {keys.some(
          (key) =>
            parameterCapability(writeCapabilities, proposal.presetKind, key)?.panelVisibility ===
            'hidden',
        ) && <p className="proposal-hidden-note">{t('proposal.parameter.hiddenHelp')}</p>}

        {awaitingApproval && (
          <>
            <fieldset className="proposal-destinations">
              <legend>{t('proposal.destination')}</legend>
              {DESTINATIONS.map((value) => (
                <label key={value}>
                  <input
                    checked={destination === value}
                    disabled={pendingAction !== null}
                    name={`proposal-destination-${proposal.id}`}
                    onChange={() => setDestination(value)}
                    type="radio"
                  />
                  <span>
                    <strong>{t(`proposal.destination.${value}`)}</strong>
                    <small>{t(`proposal.destination.${value}.body`)}</small>
                  </span>
                </label>
              ))}
            </fieldset>
            {destination === 'save-as-new-preset' && (
              <label className="proposal-name-field">
                <span>{t('proposal.newName')}</span>
                <input
                  disabled={pendingAction !== null}
                  maxLength={160}
                  onChange={(event) => setNewPresetName(event.target.value)}
                  placeholder={t('proposal.newNamePlaceholder')}
                  value={newPresetName}
                />
              </label>
            )}
            {formError && <div className="form-error proposal-form-error">{formError}</div>}
            <div className="proposal-actions">
              <button
                className="secondary-button proposal-reject"
                disabled={pendingAction !== null}
                onClick={() => void reject()}
                type="button"
              >
                <X aria-hidden="true" size={15} />
                {pendingAction === 'reject' ? t('proposal.rejecting') : t('proposal.reject')}
              </button>
              <button
                className="primary-button proposal-approve"
                disabled={pendingAction !== null}
                onClick={() => void approve()}
                type="button"
              >
                <Check aria-hidden="true" size={15} />
                {pendingAction === 'approve' ? t('proposal.approving') : t('proposal.approve')}
              </button>
            </div>
            <p className="proposal-disclaimer">{t('proposal.disclaimer')}</p>
          </>
        )}

        {awaitingOrca && (
          <div className="proposal-awaiting-orca">
            <Clock3 aria-hidden="true" size={16} />
            <span>{t('proposal.awaitingOrca')}</span>
          </div>
        )}

        {proposal.status === 'applied' && (
          <>
            <div className="proposal-verified">
              <CheckCircle2 aria-hidden="true" size={17} />
              <span>
                <strong>{t('proposal.verified.title')}</strong>
                <small>
                  {t('proposal.verified.body', {
                    destination: t(`proposal.destination.${proposal.destination}`),
                    revision: proposal.authoritativeRevision ?? '—',
                  })}
                </small>
              </span>
            </div>
            {proposal.rollbackGuard && (
              <div className="proposal-rollback">
                <p>{t('proposal.rollbackBody')}</p>
                <button
                  className="secondary-button"
                  disabled={pendingAction !== null}
                  onClick={() => void rollback()}
                  type="button"
                >
                  <RotateCcw aria-hidden="true" size={15} />
                  {pendingAction === 'rollback'
                    ? t('proposal.rollingBack')
                    : t('proposal.rollback')}
                </button>
              </div>
            )}
          </>
        )}

        {nativeStateKey && (
          <div className={`proposal-native-state proposal-native-state-${proposal.status}`}>
            <RotateCcw aria-hidden="true" size={16} />
            <span>{t(nativeStateKey)}</span>
          </div>
        )}

        {proposal.error && <div className="form-error proposal-form-error">{proposal.error}</div>}
      </div>
    </section>
  )
}
