import { randomBytes } from 'node:crypto'
import { isAbsolute, resolve } from 'node:path'

export interface HelperOptions {
  readonly port: number
  readonly token: string
  readonly stateFile: string | null
  readonly parentPid: number | null
}

function argument(argv: readonly string[], name: string): string | undefined {
  const direct = argv.find((value) => value.startsWith(`${name}=`))
  if (direct) return direct.slice(name.length + 1)
  const index = argv.indexOf(name)
  return index >= 0 ? argv[index + 1] : undefined
}

export function parseHelperOptions(
  argv: readonly string[],
  environment: NodeJS.ProcessEnv = process.env,
): HelperOptions | null {
  if (!argv.includes('--serve')) return null
  const portText = argument(argv, '--port') ?? environment.ORCA_PRESET_ASSISTANT_HELPER_PORT ?? '0'
  const token =
    argument(argv, '--session-token') ??
    environment.ORCA_PRESET_ASSISTANT_SESSION_TOKEN ??
    randomBytes(32).toString('base64url')
  const stateFileValue =
    argument(argv, '--state-file') ?? environment.ORCA_PRESET_ASSISTANT_HELPER_STATE
  const parentPidText =
    argument(argv, '--parent-pid') ?? environment.ORCA_PRESET_ASSISTANT_PARENT_PID
  const host = argument(argv, '--host') ?? '127.0.0.1'
  const port = Number(portText)
  const parentPid = parentPidText === undefined ? null : Number(parentPidText)
  if (
    host !== '127.0.0.1' ||
    !Number.isInteger(port) ||
    port < 0 ||
    port > 65_535 ||
    !/^[A-Za-z0-9._~-]{32,256}$/u.test(token) ||
    (stateFileValue !== undefined && !isAbsolute(stateFileValue)) ||
    (parentPid !== null && (!Number.isSafeInteger(parentPid) || parentPid <= 0))
  ) {
    throw new Error('invalid-helper-options')
  }
  return {
    port,
    token,
    stateFile: stateFileValue ? resolve(stateFileValue) : null,
    parentPid,
  }
}
