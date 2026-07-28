import type { DashboardApi } from '@shared/contracts'

declare global {
  interface Window {
    readonly dashboard: DashboardApi
  }
}

export {}
