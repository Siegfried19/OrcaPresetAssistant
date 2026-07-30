import { ShieldCheck, Wifi, X } from 'lucide-react'
import { useEffect, useState } from 'react'

import type {
  AppSettingsView,
  CodexPermissionScope,
  Language,
  ThreeMfPolicy,
  UpdateSettingsRequest,
} from '@shared/contracts'

import { useI18n } from '../i18n/I18nProvider'

interface SettingsSheetProps {
  readonly settings: AppSettingsView
  readonly onClose: () => void
  readonly onUpdate: (request: UpdateSettingsRequest) => Promise<void>
  readonly onSetScope: (scope: CodexPermissionScope) => Promise<void>
  readonly onSetLanguage: (language: Language) => Promise<void>
}

const SCOPES: readonly CodexPermissionScope[] = ['general', 'current-settings', 'current-project']
const THREE_MF_POLICIES: readonly ThreeMfPolicy[] = ['always', 'ask', 'never']

export function SettingsSheet({
  settings,
  onClose,
  onUpdate,
  onSetScope,
  onSetLanguage,
}: SettingsSheetProps): React.JSX.Element {
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [busy, onClose])

  const perform = async (operation: () => Promise<void>): Promise<void> => {
    setBusy(true)
    try {
      await operation()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose} role="presentation">
      <section
        aria-labelledby="settings-title"
        aria-modal="true"
        className="settings-sheet"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="sheet-header">
          <div>
            <span className="sheet-eyebrow">{t('settings.eyebrow')}</span>
            <h2 id="settings-title">{t('settings.title')}</h2>
            <p>{t('settings.subtitle')}</p>
          </div>
          <button
            aria-label={t('action.close')}
            className="icon-button"
            disabled={busy}
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </header>

        <div className="settings-content">
          <section className="settings-section">
            <div>
              <h3>{t('settings.lanOnlyTitle')}</h3>
              <p>{t('settings.lanOnlyBody')}</p>
            </div>
            <div className="settings-info-card">
              <Wifi aria-hidden="true" size={18} />
              <div>
                <strong>{t('settings.developerModeTitle')}</strong>
                <p>{t('settings.developerModeBody')}</p>
                <small>{t('settings.developerModeSafety')}</small>
              </div>
            </div>
          </section>

          <section className="settings-section">
            <div>
              <h3>{t('settings.archiveTitle')}</h3>
              <p>{t('settings.archiveBody')}</p>
            </div>
            <label className="toggle-row">
              <span>{t('settings.autoArchive')}</span>
              <input
                checked={settings.autoArchive}
                disabled={busy}
                onChange={(event) =>
                  void perform(() => onUpdate({ autoArchive: event.target.checked }))
                }
                type="checkbox"
              />
            </label>
            <div className="settings-field">
              <span>{t('settings.threeMfPolicy')}</span>
              <div className="settings-segmented">
                {THREE_MF_POLICIES.map((policy) => (
                  <button
                    aria-pressed={settings.threeMfPolicy === policy}
                    className={settings.threeMfPolicy === policy ? 'is-active' : ''}
                    disabled={busy}
                    key={policy}
                    onClick={() => void perform(() => onUpdate({ threeMfPolicy: policy }))}
                    type="button"
                  >
                    {t(`settings.threeMf.${policy}`)}
                  </button>
                ))}
              </div>
            </div>
            {settings.autoArchive && settings.threeMfPolicy === 'ask' && (
              <p className="settings-policy-note">{t('settings.threeMfAskAutomatic')}</p>
            )}
            {settings.autoArchive && settings.threeMfPolicy === 'always' && (
              <p className="settings-policy-note">{t('settings.threeMfAlwaysAutomatic')}</p>
            )}
          </section>

          <section className="settings-section">
            <div>
              <h3>{t('settings.codexTitle')}</h3>
              <p>{t('settings.codexBody')}</p>
            </div>
            <div className="permission-options">
              {SCOPES.map((scope) => (
                <button
                  aria-pressed={settings.codexPermissions.scope === scope}
                  className={settings.codexPermissions.scope === scope ? 'is-active' : ''}
                  disabled={busy}
                  key={scope}
                  onClick={() => void perform(() => onSetScope(scope))}
                  type="button"
                >
                  <ShieldCheck aria-hidden="true" size={16} />
                  <span>
                    <strong>{t(`settings.scope.${scope}`)}</strong>
                    <small>{t(`settings.scope.${scope}.body`)}</small>
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="settings-section">
            <div>
              <h3>{t('settings.languageTitle')}</h3>
              <p>{t('settings.languageBody')}</p>
            </div>
            <div className="settings-segmented">
              {(['zh-CN', 'en'] as const).map((language) => (
                <button
                  aria-pressed={settings.language === language}
                  className={settings.language === language ? 'is-active' : ''}
                  disabled={busy}
                  key={language}
                  onClick={() => void perform(() => onSetLanguage(language))}
                  type="button"
                >
                  {language === 'zh-CN' ? '中文' : 'English'}
                </button>
              ))}
            </div>
          </section>
        </div>
      </section>
    </div>
  )
}
