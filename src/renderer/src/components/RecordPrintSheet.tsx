import { Check, ChevronDown, FileArchive, FlaskConical, Layers3, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { MATERIAL_ROLES } from '@shared/contracts'
import type {
  MaterialAssignment,
  MaterialRole,
  PresetView,
  PrintResult,
  RecordPrintRequest,
  ThreeMfPolicy,
} from '@shared/contracts'

import { useI18n } from '../i18n/I18nProvider'

interface RecordPrintSheetProps {
  readonly presets: readonly PresetView[]
  readonly selectedPreset: PresetView | null
  readonly threeMfPolicy: ThreeMfPolicy
  readonly onClose: () => void
  readonly onChooseProject3mf: () => Promise<string | null>
  readonly onSave: (request: RecordPrintRequest) => Promise<void>
}

export function RecordPrintSheet({
  presets,
  selectedPreset,
  threeMfPolicy,
  onClose,
  onChooseProject3mf,
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
  const [materials, setMaterials] = useState<MaterialAssignment[]>(
    selectedPreset?.kind === 'filament' ? [{ presetId: selectedPreset.id, role: 'model' }] : [],
  )
  const [result, setResult] = useState<PrintResult>('pending')
  const [note, setNote] = useState('')
  const [project3mfPath, setProject3mfPath] = useState<string | null>(null)
  const [choosingProject, setChoosingProject] = useState(false)
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
    setMaterials((current) => {
      if (current.some((material) => material.presetId === id)) {
        return current.filter((material) => material.presetId !== id)
      }
      return [...current, { presetId: id, role: current.length === 0 ? 'model' : 'other' }]
    })
  }

  const setMaterialRole = (presetId: string, role: MaterialRole): void => {
    setMaterials((current) =>
      current.map((material) =>
        material.presetId === presetId ? { ...material, role } : material,
      ),
    )
  }

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault()
    if (!processId) {
      setFormError(t('record.processRequired'))
      return
    }
    if (materials.length === 0) {
      setFormError(t('record.filamentRequired'))
      return
    }
    if (threeMfPolicy === 'always' && !project3mfPath) {
      setFormError(t('record.projectRequired'))
      return
    }

    setSaving(true)
    setFormError(null)
    try {
      await onSave({
        processId,
        materials,
        result,
        note,
        ...(threeMfPolicy !== 'never' && project3mfPath ? { project3mfPath } : {}),
      })
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
                const checked = materials.some((material) => material.presetId === preset.id)
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
            {materials.length > 0 && (
              <div className="material-assignments">
                <div className="material-assignments-heading">
                  <strong>{t('record.materialRoles')}</strong>
                  <span className={materials.length > 1 ? 'is-multi' : ''}>
                    {materials.length > 1
                      ? t('record.multiMaterial', { count: materials.length })
                      : t('record.singleMaterial')}
                  </span>
                </div>
                {materials.map((material, index) => {
                  const preset = filamentPresets.find(
                    (candidate) => candidate.id === material.presetId,
                  )
                  if (!preset) return null

                  return (
                    <div className="material-assignment" key={material.presetId}>
                      <span className="material-order">{index + 1}</span>
                      <span className="material-assignment-name" title={preset.name}>
                        {preset.name}
                      </span>
                      <div className="select-wrap material-role-select">
                        <select
                          aria-label={t('record.roleFor', { name: preset.name })}
                          onChange={(event) =>
                            setMaterialRole(preset.id, event.target.value as MaterialRole)
                          }
                          value={material.role}
                        >
                          {MATERIAL_ROLES.map((role) => (
                            <option key={role} value={role}>
                              {t(`materialRole.${role}`)}
                            </option>
                          ))}
                        </select>
                        <ChevronDown aria-hidden="true" size={14} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </fieldset>

          <fieldset className="form-group">
            <legend>{t('record.result')}</legend>
            <div className="result-segmented">
              {(['pending', 'success', 'issue', 'failed'] as const).map((value) => (
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

          <fieldset className="form-group">
            <legend>
              <FileArchive aria-hidden="true" size={16} />
              {t('record.project3mf')}
              <span>
                {threeMfPolicy === 'always'
                  ? t('record.required')
                  : threeMfPolicy === 'never'
                    ? t('record.disabled')
                    : t('record.optional')}
              </span>
            </legend>
            {threeMfPolicy === 'never' ? (
              <div className="project-policy-notice">{t('record.projectNever')}</div>
            ) : (
              <>
                {threeMfPolicy === 'always' && (
                  <div className="project-policy-notice is-required">
                    {t('record.projectAlways')}
                  </div>
                )}
                <div className="project-picker">
                  <div>
                    <strong>
                      {project3mfPath
                        ? project3mfPath.split(/[\\/]/u).filter(Boolean).at(-1)
                        : t('record.noProjectSelected')}
                    </strong>
                    <small>
                      {project3mfPath ? t('record.projectSelected') : t('record.projectPrivacy')}
                    </small>
                  </div>
                  <div>
                    {project3mfPath && (
                      <button
                        className="secondary-button compact"
                        disabled={saving || choosingProject}
                        onClick={() => setProject3mfPath(null)}
                        type="button"
                      >
                        {t('action.remove')}
                      </button>
                    )}
                    <button
                      className="secondary-button compact"
                      disabled={saving || choosingProject}
                      onClick={() => {
                        setChoosingProject(true)
                        void onChooseProject3mf()
                          .then((path) => {
                            if (path) setProject3mfPath(path)
                          })
                          .catch(() => undefined)
                          .finally(() => setChoosingProject(false))
                      }}
                      type="button"
                    >
                      {choosingProject ? t('record.choosingProject') : t('record.chooseProject')}
                    </button>
                  </div>
                </div>
              </>
            )}
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
