import { Check, ChevronDown, FlaskConical, Layers3, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import type { PresetView, PrintResult, RecordPrintRequest } from '@shared/contracts'

import { useI18n } from '../i18n/I18nProvider'

interface RecordPrintSheetProps {
  readonly presets: readonly PresetView[]
  readonly selectedPreset: PresetView | null
  readonly onClose: () => void
  readonly onSave: (request: RecordPrintRequest) => Promise<void>
}

export function RecordPrintSheet({
  presets,
  selectedPreset,
  onClose,
  onSave,
}: RecordPrintSheetProps): React.JSX.Element {
  const { t } = useI18n()
  const processPresets = useMemo(
    () => presets.filter((preset) => preset.kind === 'process'),
    [presets],
  )
  const filamentPresets = useMemo(
    () => presets.filter((preset) => preset.kind === 'filament'),
    [presets],
  )
  const [processId, setProcessId] = useState(
    selectedPreset?.kind === 'process' ? selectedPreset.id : (processPresets[0]?.id ?? ''),
  )
  const [filamentIds, setFilamentIds] = useState<string[]>(
    selectedPreset?.kind === 'filament' ? [selectedPreset.id] : [],
  )
  const [result, setResult] = useState<PrintResult>('success')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !saving) onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, saving])

  const toggleFilament = (id: string): void => {
    setFilamentIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    )
  }

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault()
    if (!processId) {
      setFormError(t('record.processRequired'))
      return
    }
    if (filamentIds.length === 0) {
      setFormError(t('record.filamentRequired'))
      return
    }

    setSaving(true)
    setFormError(null)
    try {
      await onSave({ processId, filamentIds, result, note })
      onClose()
    } catch {
      setFormError(t('record.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-labelledby="record-title"
        aria-modal="true"
        className="record-sheet"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="sheet-header">
          <div>
            <span className="sheet-eyebrow">{t('record.eyebrow')}</span>
            <h2 id="record-title">{t('record.title')}</h2>
            <p>{t('record.subtitle')}</p>
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

        <form onSubmit={(event) => void submit(event)}>
          <div className="form-group">
            <label htmlFor="process-select">
              <Layers3 aria-hidden="true" size={16} />
              {t('record.process')}
            </label>
            <div className="select-wrap">
              <select
                id="process-select"
                onChange={(event) => setProcessId(event.target.value)}
                value={processId}
              >
                {processPresets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                  </option>
                ))}
              </select>
              <ChevronDown aria-hidden="true" size={16} />
            </div>
          </div>

          <fieldset className="form-group">
            <legend>
              <FlaskConical aria-hidden="true" size={16} />
              {t('record.filament')}
              <span>{t('record.multiple')}</span>
            </legend>
            <div className="material-options">
              {filamentPresets.map((preset) => {
                const checked = filamentIds.includes(preset.id)
                return (
                  <button
                    aria-pressed={checked}
                    className={`material-option ${checked ? 'is-checked' : ''}`}
                    key={preset.id}
                    onClick={() => toggleFilament(preset.id)}
                    type="button"
                  >
                    <span className="check-box">
                      {checked && <Check aria-hidden="true" size={13} strokeWidth={2.5} />}
                    </span>
                    <span>
                      <strong>{preset.name}</strong>
                      <small>{preset.inherits || t('record.customMaterial')}</small>
                    </span>
                  </button>
                )
              })}
            </div>
          </fieldset>

          <fieldset className="form-group">
            <legend>{t('record.result')}</legend>
            <div className="result-segmented">
              {(['success', 'issue', 'failed'] as const).map((value) => (
                <button
                  aria-pressed={result === value}
                  className={`result-choice result-choice-${value} ${
                    result === value ? 'is-selected' : ''
                  }`}
                  key={value}
                  onClick={() => setResult(value)}
                  type="button"
                >
                  <span />
                  {t(`result.${value}`)}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="form-group">
            <label htmlFor="print-note">{t('record.note')}</label>
            <textarea
              id="print-note"
              maxLength={2_000}
              onChange={(event) => setNote(event.target.value)}
              placeholder={t('record.notePlaceholder')}
              rows={3}
              value={note}
            />
            <span className="character-count">{note.length}/2000</span>
          </div>

          {formError && <div className="form-error">{formError}</div>}

          <footer className="sheet-actions">
            <button className="secondary-button" disabled={saving} onClick={onClose} type="button">
              {t('action.cancel')}
            </button>
            <button className="primary-button" disabled={saving} type="submit">
              {saving ? t('record.saving') : t('record.save')}
            </button>
          </footer>
        </form>
      </section>
    </div>
  )
}
