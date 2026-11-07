// Desktop shell (Tauri) integration.
//
// With withGlobalTauri in tauri.conf.json, the desktop shell injects window.__TAURI__ into the page.
// In a plain Web deployment that object doesn't exist, isDesktop() returns false and the related UI
// is hidden automatically, so we don't add the @tauri-apps/api npm dependency and keep Web builds
// completely unaffected.

interface TauriGlobal {
  core: {
    invoke: <T = unknown>(cmd: string, args?: Record<string, unknown>) => Promise<T>
  }
}

function tauri(): TauriGlobal | null {
  const g = window as unknown as { __TAURI__?: TauriGlobal }
  return g.__TAURI__ ?? null
}

/** Whether we're currently running inside the desktop shell (Tauri). */
export function isDesktop(): boolean {
  return tauri() !== null
}

export interface DesktopSettings {
  /** Silent start: no window on autostart, stay resident in the tray only */
  silentStart: boolean
  /** Whether autostart is registered with the system */
  autostart: boolean
  /** Auto lightweight mode: destroy the WebView after closing the window to free memory */
  autoLightweight: boolean
  /** Delay before entering lightweight mode (minutes; 0 destroys immediately on window close) */
  lightweightMinutes: number
}

// When a Tauri invoke fails it normally rejects with a string (an Err(String) from the command) or an
// error object, rather than the axios-style { response }. Normalize to a prefixed Error so callers
// don't end up falling back to "Unknown error".
function toError(e: unknown, cmd: string): Error {
  if (e instanceof Error) return e
  if (typeof e === 'string') return new Error(e)
  try {
    return new Error(`${cmd}: ${JSON.stringify(e)}`)
  } catch {
    return new Error(`${cmd}: ${String(e)}`)
  }
}

/** Read desktop settings; returns null outside the desktop shell. */
export async function getDesktopSettings(): Promise<DesktopSettings | null> {
  const t = tauri()
  if (!t) return null
  try {
    return await t.core.invoke<DesktopSettings>('get_desktop_settings')
  } catch (e) {
    throw toError(e, 'get_desktop_settings')
  }
}

/** Write desktop settings; no-op outside the desktop shell. */
export async function setDesktopSettings(settings: DesktopSettings): Promise<void> {
  const t = tauri()
  if (!t) return
  try {
    await t.core.invoke('set_desktop_settings', {
      silentStart: settings.silentStart,
      autostart: settings.autostart,
      autoLightweight: settings.autoLightweight,
      lightweightMinutes: settings.lightweightMinutes,
    })
  } catch (e) {
    throw toError(e, 'set_desktop_settings')
  }
}

export interface PortStatus {
  /** Port expected by the config */
  configured: number
  /** Actual listening port (may fall back to a random port on conflict) */
  actual: number
  /** Whether a port conflict occurred */
  conflicted: boolean
}

/** Read port status; returns null outside the desktop shell. */
export async function getPortStatus(): Promise<PortStatus | null> {
  const t = tauri()
  if (!t) return null
  try {
    return await t.core.invoke<PortStatus>('get_port_status')
  } catch (e) {
    throw toError(e, 'get_port_status')
  }
}

/** Check whether a port is currently free; returns true outside the desktop shell (no blocking). */
export async function checkPortAvailable(port: number): Promise<boolean> {
  const t = tauri()
  if (!t) return true
  try {
    return await t.core.invoke<boolean>('check_port_available', { port })
  } catch (e) {
    throw toError(e, 'check_port_available')
  }
}

/** Change the configured port and write it back to the config (takes effect after restart); no-op outside the desktop shell. */
export async function setConfiguredPort(port: number): Promise<void> {
  const t = tauri()
  if (!t) return
  try {
    await t.core.invoke('set_configured_port', { port })
  } catch (e) {
    throw toError(e, 'set_configured_port')
  }
}

export interface LogLine {
  seq: number
  ts: string
  level: string
  target: string
  message: string
}

export interface LogPull {
  enabled: boolean
  lines: LogLine[]
}

/** Pull new log lines with seq > after; returns null outside the desktop shell. */
export async function getLogs(after: number): Promise<LogPull | null> {
  const t = tauri()
  if (!t) return null
  try {
    return await t.core.invoke<LogPull>('get_logs', { after })
  } catch (e) {
    throw toError(e, 'get_logs')
  }
}

/** Enable/disable log capture; no-op outside the desktop shell. */
export async function setLogCapture(enabled: boolean): Promise<void> {
  const t = tauri()
  if (!t) return
  try {
    await t.core.invoke('set_log_capture', { enabled })
  } catch (e) {
    throw toError(e, 'set_log_capture')
  }
}

/** Clear the log buffer; no-op outside the desktop shell. */
export async function clearLogs(): Promise<void> {
  const t = tauri()
  if (!t) return
  try {
    await t.core.invoke('clear_logs')
  } catch (e) {
    throw toError(e, 'clear_logs')
  }
}

export interface ImportConfigResult {
  /** Whether the user cancelled the file picker */
  cancelled: boolean
  /** Port declared by the config after a successful import */
  port: number
}

/** Open the system file picker to import a full config.json (full overwrite, takes effect after restart); returns null outside the desktop shell. */
export async function importConfig(): Promise<ImportConfigResult | null> {
  const t = tauri()
  if (!t) return null
  try {
    return await t.core.invoke<ImportConfigResult>('import_config')
  } catch (e) {
    throw toError(e, 'import_config')
  }
}


export interface SsoCredentialCandidate {
  refreshToken: string
  clientId: string
  clientSecret: string
  region: string | null
  sourceFile: string
}

/** Scan the local AWS SSO cache and return importable credential candidates; returns [] outside the desktop shell. */
export async function scanSsoCredentials(): Promise<SsoCredentialCandidate[]> {
  const t = tauri()
  if (!t) return []
  try {
    return await t.core.invoke<SsoCredentialCandidate[]>('scan_sso_credentials')
  } catch (e) {
    throw toError(e, 'scan_sso_credentials')
  }
}

export interface UpdateInfo {
  /** Whether a new version is available */
  hasUpdate: boolean
  /** Current version */
  currentVersion: string
  /** Latest version */
  latestVersion: string
  /** Release page URL */
  releaseUrl: string
  /** Release notes */
  notes: string
}

/** Check GitHub for a new version; returns null outside the desktop shell. */
export async function checkUpdate(): Promise<UpdateInfo | null> {
  const t = tauri()
  if (!t) return null
  try {
    return await t.core.invoke<UpdateInfo>('check_update')
  } catch (e) {
    throw toError(e, 'check_update')
  }
}

/** Read the desktop shell version (embedded at compile time, no network needed); returns null outside the desktop shell. */
export async function getAppVersion(): Promise<string | null> {
  const t = tauri()
  if (!t) return null
  try {
    return await t.core.invoke<string>('get_app_version')
  } catch (e) {
    throw toError(e, 'get_app_version')
  }
}

/** Open an external link in the system browser; falls back to window.open outside the desktop shell. */
export async function openUrl(url: string): Promise<void> {
  const t = tauri()
  if (!t) {
    window.open(url, '_blank', 'noopener,noreferrer')
    return
  }
  try {
    await t.core.invoke('open_url', { url })
  } catch (e) {
    throw toError(e, 'open_url')
  }
}
