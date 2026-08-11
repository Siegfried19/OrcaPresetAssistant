import {
  CircleHelp,
  Database,
  FolderOpen,
  FolderPlus,
  Lightbulb,
  ShieldCheck,
  X,
} from 'lucide-react'
import { useEffect } from 'react'

import { useI18n } from '../i18n/I18nProvider'

interface AiHelpSheetProps {
  readonly onClose: () => void
}

const MARKETPLACE_COMMAND =
  'codex plugin marketplace add "<解压后的插件包目录 / extracted plugin package folder>"'
const INSTALL_COMMAND = 'codex plugin add orca-preset-assistant@orca-preset-assistant-release'
const VERIFY_COMMAND = 'codex plugin list'

export function AiHelpSheet({ onClose }: AiHelpSheetProps): React.JSX.Element {
  const { t } = useI18n()

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="help-backdrop" onMouseDown={onClose} role="presentation">
      <aside
        aria-labelledby="ai-help-title"
        aria-modal="true"
        className="ai-help-sheet"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header>
          <div>
            <span className="sheet-eyebrow">{t('help.eyebrow')}</span>
            <h2 id="ai-help-title">{t('help.title')}</h2>
            <p>{t('help.subtitle')}</p>
          </div>
          <button
            aria-label={t('action.close')}
            className="icon-button"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </header>

        <div className="ai-help-content">
          <section>
            <h3>
              <FolderPlus aria-hidden="true" size={17} /> {t('help.workspaceTitle')}
            </h3>
            <ol>
              <li>{t('help.workspace.choose')}</li>
              <li>{t('help.workspace.structure')}</li>
              <li>{t('help.workspace.guidance')}</li>
            </ol>
          </section>

          <section>
            <h3>
              <CircleHelp aria-hidden="true" size={17} /> {t('help.firstUse')}
            </h3>
            <ol>
              <li>{t('help.install.download')}</li>
              <li>{t('help.install.extract')}</li>
              <li>{t('help.install.marketplace')}</li>
            </ol>
            <div className="command-block">
              <code>{MARKETPLACE_COMMAND}</code>
              <code>{INSTALL_COMMAND}</code>
              <code>{VERIFY_COMMAND}</code>
            </div>
            <ol start={4}>
              <li>{t('help.install.newTask')}</li>
              <li>{t('help.install.openPresets')}</li>
            </ol>
          </section>

          <section>
            <h3>
              <ShieldCheck aria-hidden="true" size={17} /> {t('help.scopeTitle')}
            </h3>
            <div className="help-scope-list">
              <div>
                <Lightbulb aria-hidden="true" size={16} />
                <span>
                  <strong>{t('settings.scope.general')}</strong>
                  <small>{t('help.scope.general')}</small>
                </span>
              </div>
              <div>
                <Database aria-hidden="true" size={16} />
                <span>
                  <strong>{t('settings.scope.current-settings')}</strong>
                  <small>{t('help.scope.settings')}</small>
                </span>
              </div>
              <div>
                <FolderOpen aria-hidden="true" size={16} />
                <span>
                  <strong>{t('settings.scope.current-project')}</strong>
                  <small>{t('help.scope.project')}</small>
                </span>
              </div>
            </div>
          </section>

          <section>
            <h3>{t('help.promptsTitle')}</h3>
            <div className="prompt-list">
              <code>{t('help.prompt.general')}</code>
              <code>{t('help.prompt.settings')}</code>
              <code>{t('help.prompt.project')}</code>
            </div>
          </section>

          <div className="help-footer-note">{t('help.approvalNote')}</div>
        </div>
      </aside>
    </div>
  )
}
