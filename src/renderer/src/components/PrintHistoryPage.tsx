import {
  Archive,
  Cpu,
  ChevronRight,
  Database,
  FileArchive,
  FlaskConical,
  FolderOpen,
  Layers3,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  X,
} from 'lucide-react'
import { useState } from 'react'

import type {
  ParameterValue,
  PrintHistoryView,
  PrintResult,
  UpdatePrintHistoryRequest,
} from '@shared/contracts'

import { useI18n } from '../i18n/I18nProvider'
import { materialRoleTranslationKey } from '../i18n/messages'
import { formatDate } from '../lib/format'

interface PrintHistoryPageProps {
  readonly records: readonly PrintHistoryView[]
  readonly refreshing: boolean
  readonly onRefresh: () => void
  readonly onRecord: () => void
  readonly onUpdate: (request: UpdatePrintHistoryRequest) => Promise<void>
  readonly onOpenRecord: (id: string) => Promise<void>
  readonly onDelete: (id: string) => Promise<void>
}

export function PrintHistoryPage({
  records,
  refreshing,
  onRefresh,
  onRecord,
  onUpdate,
  onOpenRecord,
  onDelete,
}: PrintHistoryPageProps): React.JSX.Element {
  const { language, t } = useI18n()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selectedRecord = records.find((record) => record.id === selectedId) ?? null

  return (
    <>
      <main className="main-panel">
        <div className="main-scroll">
          <section className="page-heading">
            <div>
              <span className="eyebrow">{t('history.eyebrow')}</span>
              <h1>{t('history.title')}</h1>
              <p>{t('history.subtitle')}</p>
            </div>
            <div className="heading-actions">
              <button
                aria-label={t('action.refresh')}
                className="icon-button elevated"
                disabled={refreshing}
                onClick={onRefresh}
                title={t('action.refresh')}
                type="button"
              >
                <RefreshCw
                  aria-hidden="true"
                  className={refreshing ? 'is-spinning' : ''}
                  size={17}
                />
              </button>
              <button className="primary-button elevated" onClick={onRecord} type="button">
                <Plus aria-hidden="true" size={17} />
                {t('action.recordPrint')}
              </button>
            </div>
          </section>

          <section className="library-card history-library-card">
            {records.length === 0 ? (
              <div className="history-empty">
                <span className="history-empty-icon">
                  <Archive aria-hidden="true" size={28} strokeWidth={1.55} />
                </span>
                <strong>{t('history.emptyTitle')}</strong>
                <p>{t('history.emptyBody')}</p>
                <button className="secondary-button" onClick={onRecord} type="button">
                  <Plus aria-hidden="true" size={16} />
                  {t('history.manualRecord')}
                </button>
              </div>
            ) : (
              <>
                <header className="library-toolbar">
                  <div>
                    <h2>{t('history.listTitle')}</h2>
                    <span>{t('history.items', { count: records.length })}</span>
                  </div>
                </header>
                <div className="history-list" role="listbox" aria-label={t('history.listLabel')}>
                  {records.map((record) => (
                    <button
                      aria-selected={record.id === selectedId}
                      className={`history-row ${record.id === selectedId ? 'is-selected' : ''}`}
                      key={record.id}
                      onClick={() => setSelectedId(record.id)}
                      role="option"
                      type="button"
                    >
                      <span className="history-row-icon">
                        <FileArchive aria-hidden="true" size={17} />
                      </span>
                      <span className="history-row-copy">
                        <strong>{record.process.name}</strong>
                        <small>{formatDate(record.createdAt, language, t)}</small>
                      </span>
                      <span className={`history-result history-result-${record.result}`}>
                        {t(`history.result.${record.result}`)}
                      </span>
                      <ChevronRight aria-hidden="true" size={16} />
                    </button>
                  ))}
                </div>
              </>
            )}
          </section>
        </div>
      </main>

      {selectedRecord ? (
        <PrintHistoryInspector
          key={selectedRecord.id}
          onClose={() => setSelectedId(null)}
          onDelete={async (id) => {
            await onDelete(id)
            setSelectedId(null)
          }}
          onOpenRecord={onOpenRecord}
          onUpdate={onUpdate}
          record={selectedRecord}
        />
      ) : null}
    </>
  )
}

interface PrintHistoryInspectorProps {
  readonly record: PrintHistoryView
  readonly onClose: () => void
  readonly onUpdate: (request: UpdatePrintHistoryRequest) => Promise<void>
  readonly onOpenRecord: (id: string) => Promise<void>
  readonly onDelete: (id: string) => Promise<void>
}

function PrintHistoryInspector({
  record,
  onClose,
  onUpdate,
  onOpenRecord,
  onDelete,
}: PrintHistoryInspectorProps): React.JSX.Element {
  const { language, t } = useI18n()
  const [draftResult, setDraftResult] = useState<PrintResult>(record.result)
  const [draftNote, setDraftNote] = useState(record.note)
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [opening, setOpening] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [recordActionError, setRecordActionError] = useState<string | null>(null)
  const effectiveEntries = Object.entries(record.effectiveSettings ?? {}).sort(([left], [right]) =>
    left.localeCompare(right),
  )

  const saveUpdate = async (): Promise<void> => {
    setSaving(true)
    setEditError(null)
    try {
      await onUpdate({ id: record.id, result: draftResult, note: draftNote })
    } catch {
      setEditError(t('history.updateFailed'))
    } finally {
      setSaving(false)
    }
  }

  const openRecord = async (): Promise<void> => {
    setOpening(true)
    setRecordActionError(null)
    try {
      await onOpenRecord(record.id)
    } catch {
      setRecordActionError(t('history.openFailed'))
    } finally {
      setOpening(false)
    }
  }

  const deleteRecord = async (): Promise<void> => {
    setDeleting(true)
    setRecordActionError(null)
    try {
      await onDelete(record.id)
    } catch {
      setRecordActionError(t('history.deleteFailed'))
      setDeleting(false)
    }
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
          <span className={`history-result history-result-${record.result}`}>
            {t(`history.result.${record.result}`)}
          </span>
          <span className="history-capture-badge">
            {t(`history.capture.${record.captureQuality}`)}
          </span>
        </div>
        <h2>{record.process.name}</h2>
        <p>{formatDate(record.createdAt, language, t)}</p>
      </div>
      <div className="inspector-scroll">
        <section className="detail-section">
          <h3>{t('history.settingsTitle')}</h3>
          <dl className="detail-list">
            {record.machine ? (
              <div>
                <dt>
                  <Cpu aria-hidden="true" size={15} />
                  {t('history.machine')}
                </dt>
                <dd>{record.machine.name}</dd>
              </div>
            ) : null}
            <div>
              <dt>
                <Layers3 aria-hidden="true" size={15} />
                {t('history.process')}
              </dt>
              <dd>{record.process.name}</dd>
            </div>
            <div>
              <dt>
                <FlaskConical aria-hidden="true" size={15} />
                {t('history.materials')}
              </dt>
              <dd>{record.materials.length}</dd>
            </div>
            <div>
              <dt>
                <FileArchive aria-hidden="true" size={15} />
                {t('history.project')}
              </dt>
              <dd>
                {record.hasProject3mf ? t('history.projectSaved') : t('history.projectNotSaved')}
              </dd>
            </div>
            <div>
              <dt>
                <Database aria-hidden="true" size={15} />
                {t('history.capture')}
              </dt>
              <dd>{t(`history.capture.${record.captureQuality}`)}</dd>
            </div>
          </dl>
        </section>
        {record.materials.length > 0 && (
          <section className="detail-section">
            <h3>{t('history.materialComposition')}</h3>
            <div className="evidence-materials">
              <div>
                {record.materials.map((material, index) => (
                  <div className="evidence-material" key={`${material.presetId}-${index}`}>
                    <strong>{material.name}</strong>
                    <small>{t(materialRoleTranslationKey(material.role))}</small>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}
        <section className="detail-section">
          <h3>{t('history.parametersTitle')}</h3>
          {effectiveEntries.length > 0 ? (
            <details className="history-parameters">
              <summary>{t('history.parametersCount', { count: effectiveEntries.length })}</summary>
              <div className="history-parameter-list">
                {effectiveEntries.map(([key, value]) => (
                  <div className="history-parameter-row" key={key}>
                    <code>{key}</code>
                    <span>{formatParameterValue(value)}</span>
                  </div>
                ))}
              </div>
            </details>
          ) : (
            <p className="detail-copy">{t('history.parametersLimited')}</p>
          )}
        </section>
        <section className="detail-section history-record-actions">
          <h3>{t('history.bundleTitle')}</h3>
          <p className="detail-copy">{record.relativePath}</p>
          <button
            className="secondary-button"
            disabled={opening || deleting}
            onClick={() => void openRecord()}
            type="button"
          >
            <FolderOpen aria-hidden="true" size={15} />
            {opening ? t('history.openingBundle') : t('history.openBundle')}
          </button>
        </section>
        <section className="detail-section history-edit">
          <h3>{t('history.editTitle')}</h3>
          <div className="result-segmented">
            {(['pending', 'success', 'issue', 'failed'] as const).map((result) => (
              <button
                aria-pressed={draftResult === result}
                className={`result-choice result-choice-${result} ${
                  draftResult === result ? 'is-selected' : ''
                }`}
                disabled={saving}
                key={result}
                onClick={() => setDraftResult(result)}
                type="button"
              >
                <span />
                {t(`result.${result}`)}
              </button>
            ))}
          </div>
          <label>
            <span>{t('history.note')}</span>
            <textarea
              disabled={saving}
              maxLength={2_000}
              onChange={(event) => setDraftNote(event.target.value)}
              placeholder={t('history.notePlaceholder')}
              rows={4}
              value={draftNote}
            />
          </label>
          {editError && <div className="form-error">{editError}</div>}
          <button
            className="primary-button"
            disabled={saving || (draftResult === record.result && draftNote === record.note)}
            onClick={() => void saveUpdate()}
            type="button"
          >
            <Save aria-hidden="true" size={15} />
            {saving ? t('history.saving') : t('history.saveChanges')}
          </button>
        </section>
        <section className="detail-section history-delete">
          {confirmDelete ? (
            <div className="history-delete-confirm">
              <strong>{t('history.deleteConfirmTitle')}</strong>
              <p>{t('history.deleteConfirmBody')}</p>
              <div>
                <button
                  className="secondary-button"
                  disabled={deleting}
                  onClick={() => setConfirmDelete(false)}
                  type="button"
                >
                  {t('action.cancel')}
                </button>
                <button
                  className="danger-button"
                  disabled={deleting}
                  onClick={() => void deleteRecord()}
                  type="button"
                >
                  <Trash2 aria-hidden="true" size={15} />
                  {deleting ? t('history.deleting') : t('history.moveToTrash')}
                </button>
              </div>
            </div>
          ) : (
            <button
              className="danger-button"
              disabled={saving || opening}
              onClick={() => setConfirmDelete(true)}
              type="button"
            >
              <Trash2 aria-hidden="true" size={15} />
              {t('history.deleteRecord')}
            </button>
          )}
          {recordActionError && <div className="form-error">{recordActionError}</div>}
        </section>
      </div>
    </aside>
  )
}

function formatParameterValue(value: ParameterValue): string {
  if (value === null) return '—'
  if (Array.isArray(value)) return value.map(formatParameterValue).join(', ')
  return String(value)
}
