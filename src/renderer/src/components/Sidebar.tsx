import {
  AlertCircle,
  Boxes,
  ChevronRight,
  FileClock,
  FlaskConical,
  FolderOpen,
  Layers3,
  Printer,
  SlidersHorizontal,
} from 'lucide-react'

import type { DashboardSnapshot } from '@shared/contracts'

import { useI18n } from '../i18n/I18nProvider'
import { compactPath } from '../lib/format'
import type { ViewFilter } from '../types'

interface SidebarProps {
  readonly snapshot: DashboardSnapshot
  readonly filter: ViewFilter
  readonly onFilterChange: (filter: ViewFilter) => void
  readonly onChooseRoot: () => void
  readonly onOpenRoot: () => void
}

export function Sidebar({
  snapshot,
  filter,
  onFilterChange,
  onChooseRoot,
  onOpenRoot,
}: SidebarProps): React.JSX.Element {
  const { t } = useI18n()
  const items: readonly {
    id: ViewFilter
    label: string
    count: number
    icon: typeof Boxes
    accent?: boolean
  }[] = [
    { id: 'all', label: t('filter.all'), count: snapshot.stats.total, icon: Boxes },
    { id: 'process', label: t('sidebar.process'), count: snapshot.stats.process, icon: Layers3 },
    {
      id: 'filament',
      label: t('sidebar.filament'),
      count: snapshot.stats.filament,
      icon: FlaskConical,
    },
    { id: 'machine', label: t('sidebar.machine'), count: snapshot.stats.machine, icon: Printer },
    {
      id: 'changed',
      label: t('filter.changed'),
      count: snapshot.stats.changed,
      icon: FileClock,
      accent: snapshot.stats.changed > 0,
    },
    {
      id: 'attention',
      label: t('filter.attention'),
      count: snapshot.stats.needsAttention,
      icon: AlertCircle,
      accent: snapshot.stats.needsAttention > 0,
    },
  ]

  return (
    <aside className="sidebar">
      <nav aria-label={t('sidebar.filters')} className="sidebar-nav">
        <p className="eyebrow">{t('sidebar.library')}</p>
        {items.map((item) => {
          const Icon = item.icon
          return (
            <button
              className={`nav-item ${filter === item.id ? 'is-active' : ''}`}
              key={item.id}
              onClick={() => onFilterChange(item.id)}
              type="button"
            >
              <Icon aria-hidden="true" size={17} strokeWidth={1.8} />
              <span>{item.label}</span>
              <span className={item.accent ? 'nav-count is-accent' : 'nav-count'}>
                {item.count}
              </span>
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
            <span className="root-card-title">{t('sidebar.userPresets')}</span>
            <span className="root-card-status">
              <span className={snapshot.root.path ? 'status-dot is-online' : 'status-dot'} />
              {snapshot.root.path ? t('sidebar.autoConnected') : t('sidebar.notConnected')}
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
