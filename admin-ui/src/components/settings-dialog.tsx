import { useState, useEffect } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  KeyRound,
  Gauge,
  FileText,
  Fingerprint,
  Boxes,
  RefreshCw,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { TabNav, type TabItem } from '@/components/ui/tabs'
import { Combobox } from '@/components/ui/combobox'
import { useAppConfig, useUpdateAppConfig, useAvailableModels } from '@/hooks/use-credentials'
import { cn, extractErrorMessage } from '@/lib/utils'
import {
  isDesktop,
  getDesktopSettings,
  setDesktopSettings,
  getPortStatus,
  setConfiguredPort,
  importConfig,
  type PortStatus,
} from '@/lib/desktop'
import { storage } from '@/lib/storage'
import { Monitor, FileUp } from 'lucide-react'
import type { ModelDef } from '@/types/api'

// Settings group tabs
type SettingsTab = 'general' | 'rpm' | 'write' | 'fingerprint' | 'models' | 'desktop'

// The "Desktop" tab only appears in the Tauri desktop shell
const DESKTOP = isDesktop()

const SETTINGS_TABS: TabItem[] = [
  { value: 'general', label: 'General', icon: KeyRound },
  { value: 'rpm', label: 'RPM Limits', icon: Gauge },
  { value: 'write', label: 'Writes & Truncation', icon: FileText },
  { value: 'fingerprint', label: 'Version Fingerprint', icon: Fingerprint },
  { value: 'models', label: 'Models & Aliases', icon: Boxes },
  ...(DESKTOP ? [{ value: 'desktop', label: 'Desktop', icon: Monitor } as TabItem] : []),
]

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

// Optional numeric input: an empty string maps to undefined (fall back to the default)
function parseOptionalRpm(value: string): number | null | undefined {
  const trimmed = value.trim()
  if (trimmed === '') return null
  const n = parseInt(trimmed, 10)
  return Number.isFinite(n) && n >= 0 ? n : null
}


interface ModelAliasRow {
  from: string
  to: string
}

function aliasesToRows(aliases: Record<string, string>): ModelAliasRow[] {
  return Object.entries(aliases).map(([from, to]) => ({ from, to }))
}

function rowsToAliases(rows: ModelAliasRow[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const row of rows) {
    const from = row.from.trim()
    const to = row.to.trim()
    if (from && to) {
      out[from] = to
    }
  }
  return out
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const { data: config, isLoading, error } = useAppConfig()
  const { mutate: updateConfig, isPending } = useUpdateAppConfig()
  const {
    data: availableModels,
    refetch: refetchAvailableModels,
    isFetching: isFetchingModels,
  } = useAvailableModels()

  const [activeTab, setActiveTab] = useState<SettingsTab>('general')
  const [apiKey, setApiKey] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)
  const [credentialRpm, setCredentialRpm] = useState('0')
  const [rpmOpus, setRpmOpus] = useState('')
  const [rpmSonnet, setRpmSonnet] = useState('')
  const [rpmHaiku, setRpmHaiku] = useState('')
  const [rpmMaxWaitMs, setRpmMaxWaitMs] = useState('0')
  const [kiroVersion, setKiroVersion] = useState('')
  const [machineId, setMachineId] = useState('')
  const [systemVersion, setSystemVersion] = useState('')
  const [nodeVersion, setNodeVersion] = useState('')
  const [streamingSdkVersion, setStreamingSdkVersion] = useState('')
  const [models, setModels] = useState<ModelDef[]>([])
  const [modelsExpanded, setModelsExpanded] = useState(true)
  const [defaultModel, setDefaultModel] = useState('')
  const [modelAliases, setModelAliases] = useState<ModelAliasRow[]>([])
  const [aliasesExpanded, setAliasesExpanded] = useState(false)
  const [chunkedEnabled, setChunkedEnabled] = useState(false)
  const [chunkedTriggerLines, setChunkedTriggerLines] = useState('150')
  const [chunkedChunkLines, setChunkedChunkLines] = useState('50')
  const [codexTruncationCorrection, setCodexTruncationCorrection] = useState(true)
  const [quotaResetRecoveryEnabled, setQuotaResetRecoveryEnabled] = useState(false)
  // Desktop shell settings (desktop only)
  const [silentStart, setSilentStart] = useState(false)
  const [autostart, setAutostart] = useState(false)
  const [autoLightweight, setAutoLightweight] = useState(true)
  const [lightweightMinutes, setLightweightMinutes] = useState(0)
  const [portStatus, setPortStatus] = useState<PortStatus | null>(null)
  const [portInput, setPortInput] = useState('')
  const [portSaving, setPortSaving] = useState(false)
  const [adminApiKey, setAdminApiKeyState] = useState('')
  const [showAdminKey, setShowAdminKey] = useState(false)
  // Global proxy (config level; requires a restart)
  const [proxyUrl, setProxyUrl] = useState('')
  const [proxyUsername, setProxyUsername] = useState('')
  const [proxyPassword, setProxyPassword] = useState('')
  // The backend only reports whether a password is set, never the plaintext; use that for the placeholder and keep the password unchanged when submitted empty
  const [proxyPasswordSet, setProxyPasswordSet] = useState(false)

  // Fill the form with the server values when the dialog opens (or the data arrives)
  useEffect(() => {
    if (!open || !config) return
    setActiveTab('general')
    // Defaults on open: model list expanded, aliases collapsed
    setModelsExpanded(true)
    setAliasesExpanded(false)
    setApiKey(config.apiKey)
    setAdminApiKeyState(config.adminApiKey ?? '')
    setCredentialRpm(String(config.credentialRpm ?? 0))
    setRpmOpus(config.credentialRpmOpus == null ? '' : String(config.credentialRpmOpus))
    setRpmSonnet(config.credentialRpmSonnet == null ? '' : String(config.credentialRpmSonnet))
    setRpmHaiku(config.credentialRpmHaiku == null ? '' : String(config.credentialRpmHaiku))
    setRpmMaxWaitMs(String(config.credentialRpmMaxWaitMs ?? 0))
    setKiroVersion(config.kiroVersion)
    setMachineId(config.machineId ?? '')
    setSystemVersion(config.systemVersion)
    setNodeVersion(config.nodeVersion)
    setStreamingSdkVersion(config.streamingSdkVersion)
    setModels(config.models.map((m) => ({ ...m })))
    setDefaultModel(config.defaultModel ?? '')
    setModelAliases(aliasesToRows(config.modelAliases ?? {}))
    setChunkedEnabled(config.chunkedWritePolicy?.enabled ?? false)
    setChunkedTriggerLines(String(config.chunkedWritePolicy?.triggerLines ?? 150))
    setChunkedChunkLines(String(config.chunkedWritePolicy?.chunkLines ?? 50))
    setCodexTruncationCorrection(config.codexTruncationCorrection ?? true)
    setQuotaResetRecoveryEnabled(config.quotaResetRecoveryEnabled ?? false)
    setProxyUrl(config.proxyUrl ?? '')
    setProxyUsername(config.proxyUsername ?? '')
    setProxyPassword('') // The plaintext is never returned; leave empty to keep it unchanged
    setProxyPasswordSet(config.proxyPasswordSet ?? false)
  }, [open, config])

  // Desktop settings load independently of the server config
  useEffect(() => {
    if (!open || !DESKTOP) return
    getDesktopSettings()
      .then((s) => {
        if (s) {
          setSilentStart(s.silentStart)
          setAutostart(s.autostart)
          setAutoLightweight(s.autoLightweight)
          setLightweightMinutes(s.lightweightMinutes)
        }
      })
      .catch((e) => {
        toast.error(`Failed to read desktop settings: ${extractErrorMessage(e)}`)
      })
    getPortStatus()
      .then((p) => {
        if (p) {
          setPortStatus(p)
          setPortInput(String(p.configured))
        }
      })
      .catch((e) => {
        toast.error(`Failed to read the port status: ${extractErrorMessage(e)}`)
      })
  }, [open])

  // Desktop toggles apply immediately (OS-level settings, independent of the "Save & Apply" button)
  const applyDesktop = (next: {
    silentStart?: boolean
    autostart?: boolean
    autoLightweight?: boolean
    lightweightMinutes?: number
  }) => {
    const merged = {
      silentStart: next.silentStart ?? silentStart,
      autostart: next.autostart ?? autostart,
      autoLightweight: next.autoLightweight ?? autoLightweight,
      lightweightMinutes: next.lightweightMinutes ?? lightweightMinutes,
    }
    setSilentStart(merged.silentStart)
    setAutostart(merged.autostart)
    setAutoLightweight(merged.autoLightweight)
    setLightweightMinutes(merged.lightweightMinutes)
    setDesktopSettings(merged).catch((e) => {
      toast.error(`Failed to save desktop settings: ${extractErrorMessage(e)}`)
    })
  }

  // Save port: the frontend checks the range first and the backend re-probes availability before writing
  const handleSavePort = async () => {
    const port = parseInt(portInput, 10)
    if (!Number.isFinite(port) || port < 1 || port > 65535) {
      toast.error('The port must be between 1 and 65535')
      return
    }
    if (portStatus && port === portStatus.configured) {
      toast.info('The port is unchanged')
      return
    }
    setPortSaving(true)
    try {
      await setConfiguredPort(port)
      toast.success(`Port changed to ${port}; restart the app to apply it`)
      const p = await getPortStatus()
      if (p) setPortStatus(p)
    } catch (e) {
      toast.error(`Failed to save the port: ${extractErrorMessage(e)}`)
    } finally {
      setPortSaving(false)
    }
  }

  const [importing, setImporting] = useState(false)
  // Import a full config.json (complete overwrite; takes effect after a restart)
  const handleImportConfig = async () => {
    setImporting(true)
    try {
      const res = await importConfig()
      if (res && !res.cancelled) {
        toast.success(`Config imported (port ${res.port}); restart the app to apply it`)
      }
    } catch (e) {
      toast.error(`Failed to import the config: ${extractErrorMessage(e)}`)
    } finally {
      setImporting(false)
    }
  }

  const updateModel = (index: number, patch: Partial<ModelDef>) => {
    setModels((prev) => prev.map((m, i) => (i === index ? { ...m, ...patch } : m)))
  }

  const addModel = () => {
    setModels((prev) => [
      ...prev,
      {
        family: '',
        version: '',
        kiroId: '',
        displayId: '',
        displayName: '',
        created: Math.floor(Date.now() / 1000),
        maxTokens: 64000,
        contextWindow: 200000,
      },
    ])
  }

  const removeModel = (index: number) => {
    setModels((prev) => prev.filter((_, i) => i !== index))
  }

  const addAlias = () => {
    setModelAliases((prev) => [...prev, { from: '', to: '' }])
  }

  const updateAlias = (index: number, patch: Partial<ModelAliasRow>) => {
    setModelAliases((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  const removeAlias = (index: number) => {
    setModelAliases((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!apiKey.trim()) {
      setActiveTab('general')
      toast.error('apiKey is required')
      return
    }
    if (!adminApiKey.trim()) {
      setActiveTab('general')
      toast.error('Admin API Key is required')
      return
    }
    if (
      !kiroVersion.trim() ||
      !systemVersion.trim() ||
      !nodeVersion.trim() ||
      !streamingSdkVersion.trim()
    ) {
      setActiveTab('fingerprint')
      toast.error('All version fields are required')
      return
    }
    if (models.length === 0) {
      setActiveTab('models')
      setModelsExpanded(true)
      toast.error('At least one model definition is required')
      return
    }
    for (let i = 0; i < models.length; i++) {
      const m = models[i]
      if (!m.family.trim() || !m.kiroId.trim() || !m.displayId.trim() || !m.displayName.trim()) {
        setActiveTab('models')
        setModelsExpanded(true)
        toast.error(`Model #${i + 1}: family / kiroId / displayId / displayName are all required`)
        return
      }
      if (m.maxTokens <= 0 || m.contextWindow <= 0) {
        setActiveTab('models')
        setModelsExpanded(true)
        toast.error(`Model #${i + 1}: maxTokens / contextWindow must be positive numbers`)
        return
      }
    }

    for (let i = 0; i < modelAliases.length; i++) {
      const row = modelAliases[i]
      const hasFrom = row.from.trim().length > 0
      const hasTo = row.to.trim().length > 0
      if (hasFrom !== hasTo) {
        setActiveTab('models')
        setAliasesExpanded(true)
        toast.error(`Model alias #${i + 1}: the client name and the mapped target must both be filled in or both left empty`)
        return
      }
    }

    const triggerLines = parseInt(chunkedTriggerLines, 10) || 0
    const chunkLines = parseInt(chunkedChunkLines, 10) || 0
    if (chunkedEnabled && chunkLines <= 0) {
      setActiveTab('write')
      toast.error('Chunk lines must be a positive number')
      return
    }
    if (chunkedEnabled && triggerLines < chunkLines) {
      setActiveTab('write')
      toast.error('Trigger lines cannot be smaller than chunk lines')
      return
    }

    const cleanedModels: ModelDef[] = models.map((m) => ({
      family: m.family.trim(),
      version: m.version?.trim() ? m.version.trim() : null,
      kiroId: m.kiroId.trim(),
      displayId: m.displayId.trim(),
      displayName: m.displayName.trim(),
      created: m.created,
      maxTokens: m.maxTokens,
      contextWindow: m.contextWindow,
    }))

    const trimmedAdminKey = adminApiKey.trim()
    updateConfig(
      {
        apiKey: apiKey.trim(),
        adminApiKey: trimmedAdminKey,
        credentialRpm: parseInt(credentialRpm, 10) || 0,
        credentialRpmOpus: parseOptionalRpm(rpmOpus),
        credentialRpmSonnet: parseOptionalRpm(rpmSonnet),
        credentialRpmHaiku: parseOptionalRpm(rpmHaiku),
        credentialRpmMaxWaitMs: Math.max(0, parseInt(rpmMaxWaitMs, 10) || 0),
        kiroVersion: kiroVersion.trim(),
        machineId: machineId.trim(),
        systemVersion: systemVersion.trim(),
        nodeVersion: nodeVersion.trim(),
        streamingSdkVersion: streamingSdkVersion.trim(),
        models: cleanedModels,
        defaultModel: defaultModel.trim() || null,
        modelAliases: rowsToAliases(modelAliases),
        chunkedWritePolicy: {
          enabled: chunkedEnabled,
          // Submit the current values even when disabled so a later re-enable keeps them
          triggerLines: triggerLines || 150,
          chunkLines: chunkLines || 50,
        },
        codexTruncationCorrection,
        quotaResetRecoveryEnabled,
        proxyUrl: proxyUrl.trim(),
        proxyUsername: proxyUsername.trim(),
        // An empty password field means "unchanged" (an omitted field makes the backend keep the current value); only submit when filled in
        ...(proxyPassword ? { proxyPassword } : {}),
      },
      {
        onSuccess: () => {
          // Once adminApiKey is hot-applied the locally stored login key becomes invalid at once; update it so the current session is not logged out
          storage.setApiKey(trimmedAdminKey)
          toast.success('Configuration saved and applied live')
          onOpenChange(false)
        },
        onError: (err: unknown) => {
          toast.error(`Failed to save: ${extractErrorMessage(err)}`)
        },
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex flex-1 items-center justify-center text-muted-foreground">Loading configuration...</div>
        ) : error ? (
          <div className="flex flex-1 items-center justify-center text-center text-destructive">
            Failed to load the configuration: {extractErrorMessage(error)}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1">
            <div className="flex min-h-0 flex-1 gap-4 py-4">
              {/* Left tab navigation */}
              <TabNav
                items={SETTINGS_TABS}
                value={activeTab}
                onChange={(v) => setActiveTab(v as SettingsTab)}
                className="w-52 shrink-0 border-r pr-3"
              />

              {/* Right content area (switched per tab) */}
              <div className="space-y-6 overflow-y-auto flex-1 pr-1">
              {/* API Key */}
              <section className={`space-y-2 ${activeTab === 'general' ? '' : 'hidden'}`}>
                <h3 className="text-sm font-semibold">Client API Key</h3>
                <div className="relative">
                  <Input
                    type={showApiKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    disabled={isPending}
                    placeholder="Client access key"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                  >
                    {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Takes effect for subsequent client requests immediately. Note: the old key stops working after saving, so update your callers accordingly.
                </p>

                <h3 className="text-sm font-semibold pt-2">Admin API Key (management key)</h3>
                <div className="relative">
                  <Input
                    type={showAdminKey ? 'text' : 'password'}
                    value={adminApiKey}
                    onChange={(e) => setAdminApiKeyState(e.target.value)}
                    disabled={isPending}
                    placeholder="Admin panel access key"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAdminKey((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                  >
                    {showAdminKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  The key used to access this admin panel; it takes effect immediately after saving. The desktop build uses it to log in automatically, and this page updates in sync without being logged out.
                  Note: other logged-in clients must sign in again with the new key.
                </p>

                <h3 className="text-sm font-semibold pt-2">Global Proxy</h3>
                <Input
                  value={proxyUrl}
                  onChange={(e) => setProxyUrl(e.target.value)}
                  disabled={isPending}
                  placeholder="Proxy URL, e.g. http://host:port or socks5://host:port (leave empty to disable)"
                />
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    value={proxyUsername}
                    onChange={(e) => setProxyUsername(e.target.value)}
                    disabled={isPending}
                    placeholder="Proxy username (optional)"
                    autoComplete="off"
                  />
                  <Input
                    type="password"
                    value={proxyPassword}
                    onChange={(e) => setProxyPassword(e.target.value)}
                    disabled={isPending}
                    placeholder={proxyPasswordSet ? 'Already set (leave empty to keep it)' : 'Proxy password (optional)'}
                    autoComplete="new-password"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  All credentials use this proxy by default; each credential can override it in its own config (set <code>direct</code> to bypass the proxy).{' '}
                  <span className="text-amber-600 dark:text-amber-500">Requires an app restart to take effect</span>{' '}
                  (the proxy connection is established and cached at startup).
                </p>
              </section>

              {/* RPM limits */}
              <section className={`space-y-2 ${activeTab === 'rpm' ? '' : 'hidden'}`}>
                <h3 className="text-sm font-semibold">Credential RPM Limits</h3>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Fallback (credentialRpm)</label>
                    <Input
                      type="number"
                      min="0"
                      value={credentialRpm}
                      onChange={(e) => setCredentialRpm(e.target.value)}
                      disabled={isPending}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Opus</label>
                    <Input
                      type="number"
                      min="0"
                      placeholder="Fallback"
                      value={rpmOpus}
                      onChange={(e) => setRpmOpus(e.target.value)}
                      disabled={isPending}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Sonnet</label>
                    <Input
                      type="number"
                      min="0"
                      placeholder="Fallback"
                      value={rpmSonnet}
                      onChange={(e) => setRpmSonnet(e.target.value)}
                      disabled={isPending}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Haiku</label>
                    <Input
                      type="number"
                      min="0"
                      placeholder="Fallback"
                      value={rpmHaiku}
                      onChange={(e) => setRpmHaiku(e.target.value)}
                      disabled={isPending}
                    />
                  </div>
                </div>
                <div className="space-y-1 max-w-xs">
                  <label className="text-xs text-muted-foreground">
                    Wait when RPM is saturated (credentialRpmMaxWaitMs, ms)
                  </label>
                  <Input
                    type="number"
                    min="0"
                    value={rpmMaxWaitMs}
                    onChange={(e) => setRpmMaxWaitMs(e.target.value)}
                    disabled={isPending}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Per-credential request limit per minute. 0 or empty means no separate limit (leaving a per-family field empty falls back to the fallback value).
                  "Wait when RPM is saturated": the maximum number of milliseconds to wait before sending a request when every credential is at its limit; 0 means do not wait and return 429 to the client immediately.
                </p>
              </section>

              {/* Chunked write policy */}
              <section className={`space-y-2 ${activeTab === 'write' ? '' : 'hidden'}`}>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Write/Edit Chunked Writes</h3>
                  <Switch
                    checked={chunkedEnabled}
                    onCheckedChange={setChunkedEnabled}
                    disabled={isPending}
                  />
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 max-w-md">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">
                      Trigger lines (triggerLines)
                    </label>
                    <Input
                      type="number"
                      min="1"
                      value={chunkedTriggerLines}
                      onChange={(e) => setChunkedTriggerLines(e.target.value)}
                      disabled={isPending || !chunkedEnabled}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">
                      Chunk lines (chunkLines)
                    </label>
                    <Input
                      type="number"
                      min="1"
                      value={chunkedChunkLines}
                      onChange={(e) => setChunkedChunkLines(e.target.value)}
                      disabled={isPending || !chunkedEnabled}
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Injects a "chunked writes for very long content" constraint into the Write/Edit tool descriptions to avoid truncated model output leaving
                  incomplete tool_use arguments that void the whole call. Content is chunked only when it exceeds the trigger line count, and every chunk stays within
                  the chunk line count (including the first Write chunk and later Edit appends). The defaults are 150 / 50 — the 50 per chunk
                  comes from the official Kiro IDE WRITE_LIMIT constant, while the trigger threshold is relaxed to 150 so small and medium files are written in one go.
                  The corrective instruction fed back to the model when truncation happens also uses the chunk line count.
                  <span className="text-amber-600 dark:text-amber-500">
                    {' '}
                    Note: Kiro bills per request, and chunking splits one write into several tool round trips, which significantly increases quota usage.
                  </span>
                </p>
              </section>

              {/* Codex truncation correction */}
              <section className={`space-y-2 ${activeTab === 'write' ? '' : 'hidden'}`}>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Codex Truncation Correction</h3>
                  <Switch
                    checked={codexTruncationCorrection}
                    onCheckedChange={setCodexTruncationCorrection}
                    disabled={isPending}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  When a codex (/v1/responses) tool argument is truncated by max_tokens (the start arrives with no stop),
                  a chunking correction text is appended to tell the model to write in chunks, using the chunk line count above. When disabled, only the correction text stops;
                  the sealing fix for dangling items (adding output_item.done and setting status=incomplete) still applies unconditionally.
                  <span className="text-muted-foreground">
                    {' '}
                    Note: this switch only affects the codex client, so verify its actual response to the correction text yourself.
                  </span>
                </p>
              </section>

              {/* Monthly quota auto-recovery */}
              <section className={`space-y-2 ${activeTab === 'write' ? '' : 'hidden'}`}>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Monthly Quota Auto-Recovery</h3>
                  <Switch
                    checked={quotaResetRecoveryEnabled}
                    onCheckedChange={setQuotaResetRecoveryEnabled}
                    disabled={isPending}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  When enabled, credentials disabled for monthly quota exhaustion are automatically
                  re-enabled once the quota reset time passes and remaining quota is positive.
                  Disabled by default. Recovery is checked on balance refresh.
                </p>
              </section>

              {/* Version info */}
              <section className={`space-y-2 ${activeTab === 'fingerprint' ? '' : 'hidden'}`}>
                <h3 className="text-sm font-semibold">Version Info (upstream fingerprint)</h3>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">kiroVersion</label>
                    <Input
                      value={kiroVersion}
                      onChange={(e) => setKiroVersion(e.target.value)}
                      disabled={isPending}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">systemVersion</label>
                    <Input
                      value={systemVersion}
                      onChange={(e) => setSystemVersion(e.target.value)}
                      disabled={isPending}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">nodeVersion</label>
                    <Input
                      value={nodeVersion}
                      onChange={(e) => setNodeVersion(e.target.value)}
                      disabled={isPending}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">streamingSdkVersion</label>
                    <Input
                      value={streamingSdkVersion}
                      onChange={(e) => setStreamingSdkVersion(e.target.value)}
                      disabled={isPending}
                      placeholder="1.0.39"
                    />
                  </div>
                  <div className="space-y-1 md:col-span-2 lg:col-span-4">
                    <label className="text-xs text-muted-foreground">machineId (global default)</label>
                    <Input
                      value={machineId}
                      onChange={(e) => setMachineId(e.target.value)}
                      disabled={isPending}
                      placeholder="64-char hex or UUID"
                    />
                  </div>
                </div>
              </section>

              {/* OpenAI / Codex model mapping */}
              <section className={`space-y-3 ${activeTab === 'models' ? '' : 'hidden'}`}>
                <button
                  type="button"
                  onClick={() => setAliasesExpanded((v) => !v)}
                  className="flex items-center gap-1 text-sm font-semibold hover:text-foreground/80"
                >
                  {aliasesExpanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                  OpenAI / Codex Model Mapping{' '}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    ({modelAliases.length} aliases)
                  </span>
                </button>
                {aliasesExpanded && (
                  <>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">defaultModel (fallback when unrecognized)</label>
                      <Combobox
                        options={(availableModels?.anthropicModels || []).map((m: string) => ({ value: m, label: m }))}
                        value={defaultModel}
                        onChange={setDefaultModel}
                        disabled={isPending}
                        placeholder="claude-opus-4-6"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      When Codex sends an OpenAI model name such as gpt-5.5, it is mapped through an alias or defaultModel to a displayId in the model list below
                    </p>
                    <div className="space-y-2">
                      {modelAliases.map((row, index) => (
                        <div key={index} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
                          <div className="space-y-1">
                            <label className="text-xs text-muted-foreground">Client model name</label>
                            <Input
                              value={row.from}
                              disabled={isPending}
                              onChange={(e) => updateAlias(index, { from: e.target.value })}
                              placeholder="gpt-5.5"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs text-muted-foreground">Mapped target</label>
                            <Combobox
                              options={(availableModels?.anthropicModels || []).map((m: string) => ({ value: m, label: m }))}
                              value={row.to}
                              disabled={isPending}
                              onChange={(v) => updateAlias(index, { to: v })}
                              placeholder="claude-opus-4-6"
                            />
                          </div>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-9 w-9 text-destructive hover:text-destructive shrink-0"
                            onClick={() => removeAlias(index)}
                            disabled={isPending}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={addAlias}
                      disabled={isPending}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add Alias
                    </Button>
                  </>
                )}
              </section>

              {/* Model list */}
              <section className={`space-y-3 ${activeTab === 'models' ? '' : 'hidden'}`}>
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setModelsExpanded((v) => !v)}
                    className="flex items-center gap-1 text-sm font-semibold hover:text-foreground/80"
                  >
                    {modelsExpanded ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                    Model List{' '}
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                      ({models.length})
                    </span>
                  </button>

                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs text-muted-foreground hover:text-foreground"
                    disabled={isFetchingModels}
                    onClick={async () => {
                      const res = await refetchAvailableModels()
                      const count = res.data?.anthropicModels?.length ?? 0
                      if (count > 0) {
                        toast.success(`Discovered ${count} models from credentials`)
                      } else {
                        toast.info('No models returned from credentials')
                      }
                    }}
                    title="Fetch available models from active credentials"
                  >
                    <RefreshCw className={cn('h-3.5 w-3.5 mr-1.5', isFetchingModels && 'animate-spin')} />
                    {isFetchingModels ? 'Fetching...' : 'Fetch from Credentials'}
                  </Button>
                </div>
                {modelsExpanded && (
                  <>
                    <div className="space-y-3">
                      {models.map((m, index) => (
                        <ModelRow
                          key={index}
                          model={m}
                          index={index}
                          disabled={isPending}
                          availableKiroIds={availableModels?.anthropicModels}
                          onChange={updateModel}
                          onRemove={removeModel}
                        />
                      ))}
                      {models.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          No models yet. Click "Add Model" to create one.
                        </p>
                      )}
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={addModel}
                      disabled={isPending}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add Model
                    </Button>
                  </>
                )}
              </section>

              {/* Desktop settings (Tauri shell only) */}
              {DESKTOP && (
                <section className={`space-y-4 ${activeTab === 'desktop' ? '' : 'hidden'}`}>
                  {/* Listen port */}
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold">Listen Port</h3>
                    {portStatus?.conflicted && (
                      <div className="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                        Port conflict: the desired port {portStatus.configured} is taken, so the app is temporarily listening on{' '}
                        <span className="font-mono font-semibold">{portStatus.actual}</span>. Pick another free port and restart the app to restore a fixed port.
                      </div>
                    )}
                    <div className="flex items-end gap-2">
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">Desired port (1–65535)</label>
                        <Input
                          type="number"
                          min="1"
                          max="65535"
                          value={portInput}
                          onChange={(e) => setPortInput(e.target.value)}
                          disabled={portSaving}
                          className="w-40"
                        />
                      </div>
                      <Button type="button" onClick={handleSavePort} disabled={portSaving}>
                        {portSaving ? 'Saving...' : 'Save Port'}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Currently listening on: <span className="font-mono">{portStatus?.actual ?? '—'}</span>
                      {portStatus && !portStatus.conflicted && ' (matches the desired port)'}
                      . Changing the port requires an app restart to take effect; the port is checked for availability before saving.
                    </p>
                  </div>

                  {/* Import config */}
                  <div className="space-y-2 border-t pt-4">
                    <h3 className="text-sm font-semibold">Import Config</h3>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleImportConfig}
                      disabled={importing}
                    >
                      <FileUp className="mr-1 h-4 w-4" />
                      {importing ? 'Importing...' : 'Import config.json from file'}
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      Imports a complete config.json and overwrites the current configuration (including apiKey / adminApiKey / port /
                      version fingerprint / models and every other field). The format and required fields are validated before importing;
                      <span className="text-amber-600 dark:text-amber-500">
                        {' '}
                        the change takes effect after an app restart
                      </span>
                      .
                    </p>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold">Launch at Login</h3>
                      <p className="text-xs text-muted-foreground">
                        Starts kiro-rs automatically after you sign in to the system
                      </p>
                    </div>
                    <Switch
                      checked={autostart}
                      onCheckedChange={(v) => applyDesktop({ autostart: v })}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold">Silent Start</h3>
                      <p className="text-xs text-muted-foreground">
                        Does not open a window on autostart and only stays in the menu bar tray; launching it manually always shows the window
                      </p>
                    </div>
                    <Switch
                      checked={silentStart}
                      onCheckedChange={(v) => applyDesktop({ silentStart: v })}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold">Auto Lightweight Mode</h3>
                      <p className="text-xs text-muted-foreground">
                        Destroys the UI process after the window has been closed for a while to free memory (down to a few dozen MB);
                        the page reloads when summoned again, with about a 1-second delay. When disabled, the window stays in memory and is summoned with no delay.
                      </p>
                    </div>
                    <Switch
                      checked={autoLightweight}
                      onCheckedChange={(v) => applyDesktop({ autoLightweight: v })}
                    />
                  </div>
                  {autoLightweight && (
                    <div className="flex items-center justify-between pl-1">
                      <div>
                        <h3 className="text-sm font-semibold">Enter Delay</h3>
                        <p className="text-xs text-muted-foreground">
                          How many minutes after closing the window to enter lightweight mode; 0 releases immediately
                        </p>
                      </div>
                      <Input
                        type="number"
                        min={0}
                        max={1440}
                        className="w-24"
                        value={String(lightweightMinutes)}
                        onChange={(e) => {
                          const n = parseInt(e.target.value, 10)
                          const v = Number.isFinite(n) && n >= 0 ? Math.min(n, 1440) : 0
                          applyDesktop({ lightweightMinutes: v })
                        }}
                      />
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    These are local desktop settings; toggles apply immediately and are not affected by the "Save & Apply" button below.
                    Closing the window hides it into the menu bar tray; click the Dock icon or the tray icon to bring it back.
                  </p>
                </section>
              )}
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? 'Saving...' : 'Save & Apply'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

interface ModelRowProps {
  model: ModelDef
  index: number
  disabled: boolean
  availableKiroIds?: string[]
  onChange: (index: number, patch: Partial<ModelDef>) => void
  onRemove: (index: number) => void
}

function ModelRow({ model, index, disabled, availableKiroIds, onChange, onRemove }: ModelRowProps) {
  return (
    <div className="rounded-md border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          #{index + 1} {model.displayName || model.displayId || '(unnamed)'}
        </span>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-destructive hover:text-destructive"
          onClick={() => onRemove(index)}
          disabled={disabled}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        <LabeledInput label="family" value={model.family} disabled={disabled}
          onChange={(v) => onChange(index, { family: v })} placeholder="opus / sonnet / haiku" />
        <LabeledInput label="version" value={model.version ?? ''} disabled={disabled}
          onChange={(v) => onChange(index, { version: v })} placeholder="e.g. 4.8 (may be empty for haiku)" />
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">kiroId</label>
          <Combobox
            options={(availableKiroIds || []).map((id) => ({ value: id, label: id }))}
            value={model.kiroId}
            onChange={(v) => onChange(index, { kiroId: v })}
            disabled={disabled}
            placeholder="claude-opus-4.8"
          />
        </div>
        <LabeledInput label="displayId" value={model.displayId} disabled={disabled}
          onChange={(v) => onChange(index, { displayId: v })} placeholder="claude-opus-4-8" />
        <LabeledInput label="displayName" value={model.displayName} disabled={disabled}
          onChange={(v) => onChange(index, { displayName: v })} placeholder="Claude Opus 4.8" />
        <LabeledInput label="maxTokens" type="number" value={String(model.maxTokens)} disabled={disabled}
          onChange={(v) => onChange(index, { maxTokens: parseInt(v, 10) || 0 })} />
        <LabeledInput label="contextWindow" type="number" value={String(model.contextWindow)} disabled={disabled}
          onChange={(v) => onChange(index, { contextWindow: parseInt(v, 10) || 0 })} />
      </div>
    </div>
  )
}

interface LabeledInputProps {
  label: string
  value: string
  disabled: boolean
  onChange: (value: string) => void
  type?: string
  placeholder?: string
}

function LabeledInput({ label, value, disabled, onChange, type, placeholder }: LabeledInputProps) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-muted-foreground">{label}</label>
      <Input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
    </div>
  )
}
