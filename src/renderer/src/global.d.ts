import type { DashboardApi } from '@shared/contracts'
import type { OrcaNativeBridge } from './host/orca-native-bridge'

declare global {
  interface Window {
    readonly dashboard?: DashboardApi
    readonly OrcaPresetAssistant?: OrcaNativeBridge | Readonly<{ available: false }>
    readonly __ORCA_PRESET_ASSISTANT_NATIVE__?: Readonly<{
      version: number
      handler: string
      token: string
    }>
    readonly wx?: Readonly<{ postMessage(message: string): void }>
  }
}

export {}
