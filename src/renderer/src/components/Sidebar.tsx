import { Boxes, ChevronRight, FolderOpen, History, SlidersHorizontal } from 'lucide-react'

import type { DashboardSnapshot } from '@shared/contracts'

import { useI18n } from '../i18n/I18nProvider'
import { compactPath } from '../lib/format'
import type { PrimaryPage } from '../types'

interface SidebarProps {
  readonly snapshot: DashboardSnapshot
  readonly page: PrimaryPage
  readonly onPageChange: (page: PrimaryPage) => void
  readonly onChooseRoot: () => void
  readonly onOpenRoot: () => void
}

export function Sidebar({
  snapshot,
  page,
  onPageChange,
  onChooseRoot,
  onOpenRoot,
}: SidebarProps): React.JSX.Element {
  const { t } = useI18n()
  const items: readonly {
    id: PrimaryPage
    label: string
    icon: typeof Boxes
  }[] = [
    {
      id: 'user-presets',
      label: t('sidebar.userPresets'),
      icon: Boxes,
    },
    {
      id: 'print-history',
      label: t('sidebar.printHistory'),
      icon: History,
    },
  ]

  return (
    <aside className="sidebar">
      <nav aria-label={t('sidebar.navigation')} className="sidebar-nav">
        <p className="eyebrow">{t('sidebar.workspace')}</p>
        {items.map((item) => {
          const Icon = item.icon
          return (
            <button
              className={`nav-item ${page === item.id ? 'is-active' : ''}`}
              key={item.id}
              onClick={() => onPageChange(item.id)}
              type="button"
            >
              <Icon aria-hidden="true" size={17} strokeWidth={1.8} />
              <span>{item.label}</span>
            </button>
          )
        })}
      </nav>

      <div className="sidebar-spacer" />

      <section className="root-card" aria-label={t('sidebar.dataSource')}>
        <div className="root-card-heading">
          <span className="root-icon">
            <SlidersHorizontal aria-hidden="true" size={16} />
          </span>
          <div>
            <span className="root-card-title">{t('sidebar.orcaWorkspace')}</span>
            <span className="root-card-status">
              <span className={snapshot.root.path ? 'status-dot is-online' : 'status-dot'} />
              {snapshot.root.path ? t('sidebar.connected') : t('sidebar.notConnected')}
            </span>
          </div>
        </div>
        <button
          className="root-path"
          onClick={onChooseRoot}
          title={snapshot.root.path || t('sidebar.chooseRoot')}
          type="button"
        >
          <span>{compactPath(snapshot.root.path, t)}</span>
          <ChevronRight aria-hidden="true" size={14} />
        </button>
        <button
          className="sidebar-secondary"
          disabled={!snapshot.root.path}
          onClick={onOpenRoot}
          type="button"
        >
          <FolderOpen aria-hidden="true" size={15} />
          {t('action.openExplorer')}
        </button>
      </section>
    </aside>
  )
}
