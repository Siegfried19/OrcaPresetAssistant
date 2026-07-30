import {
  AppWindow,
  CircleCheck,
  CircleDashed,
  FileJson2,
  FlaskConical,
  Layers3,
  Printer,
  TriangleAlert,
} from 'lucide-react'

import type { PresetKind, PresetOrigin, PrintResult } from '@shared/contracts'

import { useI18n } from '../i18n/I18nProvider'

interface KindBadgeProps {
  readonly kind: PresetKind
  readonly iconOnly?: boolean
}

const KIND_ICONS = {
  process: Layers3,
  filament: FlaskConical,
  machine: Printer,
} as const

export function KindBadge({ kind, iconOnly = false }: KindBadgeProps): React.JSX.Element {
  const { t } = useI18n()
  const Icon = KIND_ICONS[kind]
  return (
    <span className={`kind-badge kind-${kind}`} title={t(`kind.${kind}`)}>
      <Icon aria-hidden="true" size={15} strokeWidth={1.8} />
      {!iconOnly && <span>{t(`kind.${kind}`)}</span>}
    </span>
  )
}

export function OriginBadge({ origin }: { readonly origin: PresetOrigin }): React.JSX.Element {
  const { t } = useI18n()
  const Icon = origin === 'orca-managed' ? AppWindow : FileJson2
  return (
    <span className={`origin-badge origin-${origin}`} title={t(`origin.${origin}.detail`)}>
      <Icon aria-hidden="true" size={14} strokeWidth={1.8} />
      <span>{t(`origin.${origin}`)}</span>
    </span>
  )
}

export function ResultBadge({
  result,
  currentVersion = true,
}: {
  readonly result: PrintResult
  readonly currentVersion?: boolean
}): React.JSX.Element {
  const { t } = useI18n()
  const Icon =
    result === 'success' ? CircleCheck : result === 'pending' ? CircleDashed : TriangleAlert
  return (
    <span className={`result-badge result-${result}`}>
      <Icon aria-hidden="true" size={13} strokeWidth={2.2} />
      {t(`result.${result}`)}
      {!currentVersion && <span className="version-dot" title={t('result.oldVersion')} />}
    </span>
  )
}
