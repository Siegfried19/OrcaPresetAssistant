import {
  Box,
  CircleCheck,
  CircleDashed,
  FlaskConical,
  Layers3,
  Printer,
  RefreshCw,
  TriangleAlert,
} from 'lucide-react'

import type { GitState, PresetKind, PrintResult } from '@shared/contracts'

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

export function GitBadge({ state }: { readonly state: GitState }): React.JSX.Element {
  const { t } = useI18n()
  const Icon =
    state === 'clean'
      ? CircleCheck
      : state === 'unknown'
        ? CircleDashed
        : state === 'metadata'
          ? RefreshCw
          : Box
  return (
    <span className={`git-badge git-${state}`}>
      <Icon aria-hidden="true" size={13} strokeWidth={2} />
      {t(`git.${state}`)}
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
  return (
    <span className={`result-badge result-${result}`}>
      {result === 'success' ? (
        <CircleCheck aria-hidden="true" size={13} strokeWidth={2.2} />
      ) : (
        <TriangleAlert aria-hidden="true" size={13} strokeWidth={2.2} />
      )}
      {t(`result.${result}`)}
      {!currentVersion && <span className="version-dot" title={t('result.oldVersion')} />}
    </span>
  )
}
