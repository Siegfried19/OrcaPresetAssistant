import { FileCheck2, FolderPlus, FolderSearch, ShieldCheck } from 'lucide-react'

import { useI18n } from '../i18n/I18nProvider'

export function EmptyConnection({
  onChooseRoot,
}: {
  readonly onChooseRoot: () => void
}): React.JSX.Element {
  const { t } = useI18n()
  return (
    <main className="connection-empty">
      <div className="onboarding-mark">
        <FolderSearch aria-hidden="true" size={30} strokeWidth={1.55} />
      </div>
      <span className="sheet-eyebrow">{t('empty.eyebrow')}</span>
      <h1>{t('empty.title')}</h1>
      <p>{t('empty.body')}</p>
      <div className="workspace-onboarding">
        <div>
          <FolderPlus aria-hidden="true" size={18} />
          <span>
            <strong>{t('empty.createTitle')}</strong>
            <small>{t('empty.createBody')}</small>
          </span>
        </div>
        <div>
          <FileCheck2 aria-hidden="true" size={18} />
          <span>
            <strong>{t('empty.guidanceTitle')}</strong>
            <small>{t('empty.guidanceBody')}</small>
          </span>
        </div>
        <code>UserPresets/{'{machine, process, filament}'} · PrintHistory/</code>
      </div>
      <button className="primary-button large" onClick={onChooseRoot} type="button">
        {t('empty.choose')}
      </button>
      <div className="privacy-note">
        <ShieldCheck aria-hidden="true" size={16} />
        {t('empty.privacy')}
      </div>
    </main>
  )
}
