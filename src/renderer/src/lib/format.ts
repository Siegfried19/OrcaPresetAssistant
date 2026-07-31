import type { AppErrorCode, Language, PresetView } from '@shared/contracts'

import { errorTranslationKey, type Translator } from '../i18n/messages'

const APP_ERROR_CODES: readonly AppErrorCode[] = [
  'untrusted-window',
  'invalid-preset-id',
  'invalid-workspace-root',
  'workspace-not-connected',
  'preset-not-found',
  'orca-not-found',
  'invalid-print-result',
  'note-too-long',
  'filament-required',
  'duplicate-filament',
  'invalid-material-role',
  'invalid-process',
  'filament-not-found',
  'invalid-project-3mf',
  'project-3mf-not-granted',
  'print-history-not-found',
  'invalid-file-grant',
  'invalid-permission-scope',
  'invalid-change-proposal',
  'change-proposal-not-found',
  'invalid-authoritative-receipt',
  'workspace-mismatch',
  'orca-restart-required',
  'git-unavailable',
  'git-operation-failed',
  'git-nothing-to-save',
  'git-working-tree-dirty',
  'git-history-not-found',
  'invalid-version-message',
]

export function formatDate(value: string, language: Language, t: Translator): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return t('date.unknown')

  const now = new Date()
  const elapsed = now.getTime() - date.getTime()
  const day = 24 * 60 * 60 * 1_000
  const locale = language === 'zh-CN' ? 'zh-CN' : 'en-US'

  if (elapsed >= 0 && elapsed < day && now.getDate() === date.getDate()) {
    const time = new Intl.DateTimeFormat(locale, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: language === 'en',
    }).format(date)
    return t('date.today', { time })
  }

  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: language === 'en',
  }).format(date)
}

export function compactPath(path: string, t: Translator): string {
  if (!path) return t('path.notConnected')
  const parts = path.split(/[\\/]/u).filter(Boolean)
  if (parts.length <= 3) return path
  return `${parts[0]}\\…\\${parts.slice(-2).join('\\')}`
}

export function formatGitSummary(preset: PresetView, t: Translator): string {
  if (preset.gitState === 'modified' && preset.diffStats) {
    return t('git.summary.stats', {
      added: preset.diffStats.added,
      deleted: preset.diffStats.deleted,
    })
  }
  return t(`git.summary.${preset.gitState}`)
}

export function errorMessage(error: unknown, t: Translator): string {
  const message = error instanceof Error ? error.message : String(error ?? '')
  const code = APP_ERROR_CODES.find((candidate) => message.includes(candidate))
  if (code) return t(errorTranslationKey(code))
  return message && !message.includes('Error invoking remote method')
    ? message
    : t('error.fallback')
}
