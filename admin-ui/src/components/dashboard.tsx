import { useState, useEffect, useRef } from 'react'
import { RefreshCw, LogOut, Moon, Sun, Server, Plus, Upload, FileUp, FileDown, Trash2, RotateCcw, CheckCircle2, Settings, Activity, KeyRound, FileText, Github, DownloadCloud } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { storage } from '@/lib/storage'
import { normalizeCredentialImportItems } from '@/lib/credential-import'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CredentialCard } from '@/components/credential-card'
import { MonitorPanel } from '@/components/monitor-panel'
import { UsageTrendsPanel } from '@/components/usage-trends-panel'
import { type TabItem } from '@/components/ui/tabs'
import { BalanceDialog } from '@/components/balance-dialog'
import { AddCredentialDialog } from '@/components/add-credential-dialog'
import { BatchImportDialog } from '@/components/batch-import-dialog'
import { KamImportDialog } from '@/components/kam-import-dialog'
import { AwsSsoImportDialog } from '@/components/aws-sso-import-dialog'
import { BatchVerifyDialog, type VerifyResult } from '@/components/batch-verify-dialog'
import { SettingsDialog } from '@/components/settings-dialog'
import { LogPanel } from '@/components/log-panel'
import { isDesktop, checkUpdate, getAppVersion, openUrl, type UpdateInfo } from '@/lib/desktop'
import { useCredentials, useDeleteCredential, useResetFailure, useLoadBalancingMode, useSetLoadBalancingMode, useImportCredentials } from '@/hooks/use-credentials'
import { getCredentialBalance, forceRefreshToken, exportCredentials } from '@/api/credentials'
import type { LoadBalancingMode } from '@/api/credentials'
import { extractErrorMessage } from '@/lib/utils'
import type { BalanceResponse } from '@/types/api'

interface DashboardProps {
  onLogout: () => void
}

// Main view groups: Monitor / Credentials
// "Logs" tab only appears in desktop shell (Tauri)
const DESKTOP = isDesktop()

type MainTab = 'monitor' | 'credentials' | 'logs'

const MAIN_TABS: TabItem[] = [
  { value: 'monitor', label: 'Monitor', icon: Activity },
  { value: 'credentials', label: 'Credentials', icon: KeyRound },
  ...(DESKTOP ? [{ value: 'logs', label: 'Logs', icon: FileText } as TabItem] : []),
]

export function Dashboard({ onLogout }: DashboardProps) {
  const [selectedCredentialId, setSelectedCredentialId] = useState<number | null>(null)
  const [balanceDialogOpen, setBalanceDialogOpen] = useState(false)
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [batchImportDialogOpen, setBatchImportDialogOpen] = useState(false)
  const [kamImportDialogOpen, setKamImportDialogOpen] = useState(false)
  const [awsSsoImportDialogOpen, setAwsSsoImportDialogOpen] = useState(false)
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false)
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [appVersion, setAppVersion] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [verifyDialogOpen, setVerifyDialogOpen] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [verifyProgress, setVerifyProgress] = useState({ current: 0, total: 0 })
  const [verifyResults, setVerifyResults] = useState<Map<number, VerifyResult>>(new Map())
  const [balanceMap, setBalanceMap] = useState<Map<number, BalanceResponse>>(new Map())
  const [loadingBalanceIds, setLoadingBalanceIds] = useState<Set<number>>(new Set())
  const [queryingInfo, setQueryingInfo] = useState(false)
  const [queryInfoProgress, setQueryInfoProgress] = useState({ current: 0, total: 0 })
  const [batchRefreshing, setBatchRefreshing] = useState(false)
  const [batchRefreshProgress, setBatchRefreshProgress] = useState({ current: 0, total: 0 })
  const [importingFile, setImportingFile] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cancelVerifyRef = useRef(false)
  // Desktop: auto-query credential info once on first window open
  const autoQueriedRef = useRef(false)
  const [mainTab, setMainTab] = useState<MainTab>('monitor')
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 12
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return document.documentElement.classList.contains('dark')
    }
    return false
  })

  const queryClient = useQueryClient()
  const { data, isLoading, error, refetch } = useCredentials()
  const { mutate: deleteCredential } = useDeleteCredential()
  const { mutate: resetFailure } = useResetFailure()
  const { mutateAsync: importFromFile } = useImportCredentials()
  const { data: loadBalancingData, isLoading: isLoadingMode } = useLoadBalancingMode()
  const { mutate: setLoadBalancingMode, isPending: isSettingMode } = useSetLoadBalancingMode()

  // Compute pagination
  const totalPages = Math.ceil((data?.credentials.length || 0) / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const currentCredentials = data?.credentials.slice(startIndex, endIndex) || []
  const disabledCredentialCount = data?.credentials.filter(credential => credential.disabled).length || 0
  const selectedDisabledCount = Array.from(selectedIds).filter(id => {
    const credential = data?.credentials.find(c => c.id === id)
    return Boolean(credential?.disabled)
  }).length

  // Reset to the first page when the credential list changes
  useEffect(() => {
    setCurrentPage(1)
  }, [data?.credentials.length])

  // Keep only caches for credentials that still exist, avoiding stale data left behind after deletion
  useEffect(() => {
    if (!data?.credentials) {
      setBalanceMap(new Map())
      setLoadingBalanceIds(new Set())
      return
    }

    const validIds = new Set(data.credentials.map(credential => credential.id))

    setBalanceMap(prev => {
      const next = new Map<number, BalanceResponse>()
      // Keep existing balances for credentials that still exist (including manual query results)
      prev.forEach((value, id) => {
        if (validIds.has(id)) {
          next.set(id, value)
        }
      })
      // Fill in not-yet-loaded entries with the cached balance returned by the backend (shown after a page refresh without a manual query)
      let changed = next.size !== prev.size
      data.credentials.forEach(credential => {
        if (credential.cachedBalance && !next.has(credential.id)) {
          next.set(credential.id, credential.cachedBalance)
          changed = true
        }
      })
      return changed ? next : prev
    })

    setLoadingBalanceIds(prev => {
      if (prev.size === 0) {
        return prev
      }
      const next = new Set<number>()
      prev.forEach(id => {
        if (validIds.has(id)) {
          next.add(id)
        }
      })
      return next.size === prev.size ? prev : next
    })
  }, [data?.credentials])

  // Desktop: after the credential list first arrives, silently query the current page info (usage) once.
  // The backend balance endpoint has a 300s cache, so reopening the window doesn't hammer upstream; autoQueriedRef ensures the auto-trigger runs only once per session.
  useEffect(() => {
    if (!DESKTOP) return
    if (autoQueriedRef.current) return
    if (!data?.credentials || data.credentials.length === 0) return

    autoQueriedRef.current = true
    void handleQueryCurrentPageInfo({ silent: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.credentials])

  const toggleDarkMode = () => {
    setDarkMode(!darkMode)
    document.documentElement.classList.toggle('dark')
  }

  const handleViewBalance = (id: number) => {
    setSelectedCredentialId(id)
    setBalanceDialogOpen(true)
  }

  const handleRefresh = () => {
    refetch()
    toast.success('Credentials list refreshed')
  }

  const handleLogout = () => {
    storage.removeApiKey()
    queryClient.clear()
    onLogout()
  }

  // Open new version download page
  const openReleasePage = (info: UpdateInfo) => {
    openUrl(info.releaseUrl).catch((e) => toast.error(`Failed to open: ${extractErrorMessage(e)}`))
  }

  // Check for updates: request GitHub latest release, store result in updateInfo (drives button color).
  // silent=true for startup auto-check: only toast on new version, no toast on no-update/failure.
  const handleCheckUpdate = async (silent = false) => {
    if (checkingUpdate) return
    setCheckingUpdate(true)
    try {
      const info = await checkUpdate()
      if (!info) return
      setUpdateInfo(info)
      // Silent check (startup) shows no toast, only button turns green; manual click shows toast
      if (silent) return
      if (info.hasUpdate) {
        toast.success(`New version ${info.latestVersion} available (current ${info.currentVersion})`, {
          description: 'Click to go to download page',
          action: { label: 'Download', onClick: () => openReleasePage(info) },
          duration: 10000,
        })
      } else {
        toast.success(`Already on latest version (${info.currentVersion})`)
      }
    } catch (e) {
      if (!silent) toast.error(`Update check failed: ${extractErrorMessage(e)}`)
    } finally {
      setCheckingUpdate(false)
    }
  }

  // On startup, silently check for updates once and read the current version (desktop only)
  useEffect(() => {
    if (!DESKTOP) return
    handleCheckUpdate(true)
    getAppVersion()
      .then(setAppVersion)
      .catch(() => {})
    // Run only on the first mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Selection management
  const toggleSelect = (id: number) => {
    const newSelected = new Set(selectedIds)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedIds(newSelected)
  }

  const deselectAll = () => {
    setSelectedIds(new Set())
  }

  // Batch delete (only disabled items)
  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) {
      toast.error('Please select credentials to delete first')
      return
    }

    const disabledIds = Array.from(selectedIds).filter(id => {
      const credential = data?.credentials.find(c => c.id === id)
      return Boolean(credential?.disabled)
    })

    if (disabledIds.length === 0) {
      toast.error('No disabled credentials in selection')
      return
    }

    const skippedCount = selectedIds.size - disabledIds.length
    const skippedText = skippedCount > 0 ? ` (will skip ${skippedCount} non-disabled)` : ''

    if (!confirm(`Delete ${disabledIds.length} disabled credentials? This cannot be undone.${skippedText}`)) {
      return
    }

    let successCount = 0
    let failCount = 0

    for (const id of disabledIds) {
      try {
        await new Promise<void>((resolve, reject) => {
          deleteCredential(id, {
            onSuccess: () => {
              successCount++
              resolve()
            },
            onError: (err) => {
              failCount++
              reject(err)
            }
          })
        })
      } catch (error) {
        // Error handled in onError
      }
    }

    const skippedResultText = skippedCount > 0 ? `, skipped ${skippedCount} non-disabled` : ''

    if (failCount === 0) {
      toast.success(`Deleted ${successCount} disabled credentials${skippedResultText}`)
    } else {
      toast.warning(`Delete disabled: ${successCount} succeeded, ${failCount} failed${skippedResultText}`)
    }

    deselectAll()
  }

  // Batch reset failures
  const handleBatchResetFailure = async () => {
    if (selectedIds.size === 0) {
      toast.error('Please select credentials to reset first')
      return
    }

    const failedIds = Array.from(selectedIds).filter(id => {
      const cred = data?.credentials.find(c => c.id === id)
      return cred && cred.failureCount > 0
    })

    if (failedIds.length === 0) {
      toast.error('No failed credentials in selection')
      return
    }

    let successCount = 0
    let failCount = 0

    for (const id of failedIds) {
      try {
        await new Promise<void>((resolve, reject) => {
          resetFailure(id, {
            onSuccess: () => {
              successCount++
              resolve()
            },
            onError: (err) => {
              failCount++
              reject(err)
            }
          })
        })
      } catch (error) {
        // Error handled in onError
      }
    }

    if (failCount === 0) {
      toast.success(`Reset ${successCount} credentials`)
    } else {
      toast.warning(`${successCount} succeeded, ${failCount} failed`)
    }

    deselectAll()
  }

  // Batch force refresh tokens
  const handleBatchForceRefresh = async () => {
    if (selectedIds.size === 0) {
      toast.error('Please select credentials to refresh first')
      return
    }

    const enabledIds = Array.from(selectedIds).filter(id => {
      const cred = data?.credentials.find(c => c.id === id)
      return cred && !cred.disabled
    })

    if (enabledIds.length === 0) {
      toast.error('No enabled credentials in selection')
      return
    }

    setBatchRefreshing(true)
    setBatchRefreshProgress({ current: 0, total: enabledIds.length })

    let successCount = 0
    let failCount = 0

    for (let i = 0; i < enabledIds.length; i++) {
      try {
        await forceRefreshToken(enabledIds[i])
        successCount++
      } catch {
        failCount++
      }
      setBatchRefreshProgress({ current: i + 1, total: enabledIds.length })
    }

    setBatchRefreshing(false)
    queryClient.invalidateQueries({ queryKey: ['credentials'] })

    if (failCount === 0) {
      toast.success(`Refreshed tokens for ${successCount} credentials`)
    } else {
      toast.warning(`Refresh tokens: ${successCount} succeeded, ${failCount} failed`)
    }

    deselectAll()
  }

  // Clear all disabled credentials
  const handleClearAll = async () => {
    if (!data?.credentials || data.credentials.length === 0) {
      toast.error('No credentials to clear')
      return
    }

    const disabledCredentials = data.credentials.filter(credential => credential.disabled)

    if (disabledCredentials.length === 0) {
      toast.error('No disabled credentials to clear')
      return
    }

    if (!confirm(`Clear all ${disabledCredentials.length} disabled credentials? This cannot be undone.`)) {
      return
    }

    let successCount = 0
    let failCount = 0

    for (const credential of disabledCredentials) {
      try {
        await new Promise<void>((resolve, reject) => {
          deleteCredential(credential.id, {
            onSuccess: () => {
              successCount++
              resolve()
            },
            onError: (err) => {
              failCount++
              reject(err)
            }
          })
        })
      } catch (error) {
        // Error handled in onError
      }
    }

    if (failCount === 0) {
      toast.success(`Cleared all ${successCount} disabled credentials`)
    } else {
      toast.warning(`Clear disabled: ${successCount} succeeded, ${failCount} failed`)
    }

    deselectAll()
  }

  // Export all credentials to a KAM / ZyphrZero compatible JSON file
  // (includes secrets — keep it safe)
  const handleExport = async () => {
    try {
      const file = await exportCredentials()
      const count = file.accounts?.length ?? 0
      if (count === 0) {
        toast.error('No credentials to export')
        return
      }
      const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const date = new Date().toISOString().slice(0, 10)
      const a = document.createElement('a')
      a.href = url
      a.download = `kiro-accounts-${date}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast.success(`Exported ${count} credentials (file contains secrets — keep it safe)`)
    } catch (error) {
      toast.error('Export failed: ' + extractErrorMessage(error))
    }
  }

  // Import credentials from a flat backup, KAM/ZyphrZero export, or credentials.json
  const handleImportFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    let parsed: unknown
    try {
      parsed = JSON.parse(await file.text())
    } catch (error) {
      toast.error('Invalid JSON file: ' + extractErrorMessage(error))
      return
    }
    const items = normalizeCredentialImportItems(parsed)
    if (items.length === 0) {
      toast.error('No credentials found in file')
      return
    }
    setImportingFile(true)
    try {
      const result = await importFromFile(items as Record<string, unknown>[])
      const failedMsg = result.failed.length > 0 ? `, ${result.failed.length} failed` : ''
      if (result.failed.length === 0) {
        toast.success(`Import finished: ${result.added} added, ${result.duplicates} duplicates${failedMsg}`)
      } else {
        const firstError = result.failed[0]?.error ?? 'unknown error'
        toast.warning(`Import finished: ${result.added} added, ${result.duplicates} duplicates${failedMsg} (e.g. item #${(result.failed[0]?.index ?? 0) + 1}: ${firstError})`)
      }
      refetch()
    } catch (error) {
      toast.error('Import failed: ' + extractErrorMessage(error))
    } finally {
      setImportingFile(false)
    }
  }

  // Query current page credential info (sequential to avoid burst)
  // silent=true for desktop auto-trigger: no toast, silent return if no queryable
  const handleQueryCurrentPageInfo = async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false

    if (currentCredentials.length === 0) {
      if (!silent) toast.error('No queryable credentials on current page')
      return
    }

    const ids = currentCredentials
      .filter(credential => !credential.disabled)
      .map(credential => credential.id)

    if (ids.length === 0) {
      if (!silent) toast.error('No enabled credentials on current page')
      return
    }

    setQueryingInfo(true)
    setQueryInfoProgress({ current: 0, total: ids.length })

    let successCount = 0
    let failCount = 0

    for (let i = 0; i < ids.length; i++) {
      const id = ids[i]

      setLoadingBalanceIds(prev => {
        const next = new Set(prev)
        next.add(id)
        return next
      })

      try {
        const balance = await getCredentialBalance(id)
        successCount++

        setBalanceMap(prev => {
          const next = new Map(prev)
          next.set(id, balance)
          return next
        })
      } catch (error) {
        failCount++
      } finally {
        setLoadingBalanceIds(prev => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
      }

      setQueryInfoProgress({ current: i + 1, total: ids.length })
    }

    setQueryingInfo(false)

    if (!silent) {
      if (failCount === 0) {
        toast.success(`Query done: ${successCount}/${ids.length} succeeded`)
      } else {
        toast.warning(`Query done: ${successCount} succeeded, ${failCount} failed`)
      }
    }
  }

  // Batch verify
  const handleBatchVerify = async () => {
    if (selectedIds.size === 0) {
      toast.error('Please select credentials to verify first')
      return
    }

    // Initialize state
    setVerifying(true)
    cancelVerifyRef.current = false
    const ids = Array.from(selectedIds)
    setVerifyProgress({ current: 0, total: ids.length })

    let successCount = 0

    // Initialize results, all credentials as pending
    const initialResults = new Map<number, VerifyResult>()
    ids.forEach(id => {
      initialResults.set(id, { id, status: 'pending' })
    })
    setVerifyResults(initialResults)
    setVerifyDialogOpen(true)

    // Start verification
    for (let i = 0; i < ids.length; i++) {
      // Check if cancelled
      if (cancelVerifyRef.current) {
        toast.info('Verification cancelled')
        break
      }

      const id = ids[i]

      // Update current credential status to verifying
      setVerifyResults(prev => {
        const newResults = new Map(prev)
        newResults.set(id, { id, status: 'verifying' })
        return newResults
      })

      try {
        const balance = await getCredentialBalance(id)
        successCount++

        // Update to success
        setVerifyResults(prev => {
          const newResults = new Map(prev)
          newResults.set(id, {
            id,
            status: 'success',
            usage: `${balance.currentUsage}/${balance.usageLimit}`
          })
          return newResults
        })
      } catch (error) {
        // Update to failed
        setVerifyResults(prev => {
          const newResults = new Map(prev)
          newResults.set(id, {
            id,
            status: 'failed',
            error: extractErrorMessage(error)
          })
          return newResults
        })
      }

      // Update progress
      setVerifyProgress({ current: i + 1, total: ids.length })

      // Add delay to avoid rate limiting (skip for last item)
      if (i < ids.length - 1 && !cancelVerifyRef.current) {
        await new Promise(resolve => setTimeout(resolve, 2000))
      }
    }

    setVerifying(false)

    if (!cancelVerifyRef.current) {
      toast.success(`Verification done: ${successCount}/${ids.length} succeeded`)
    }
  }

  // Cancel verification
  const handleCancelVerify = () => {
    cancelVerifyRef.current = true
    setVerifying(false)
  }

  // Load balancing modes: three modes side by side, click to switch
  const loadBalancingModes: { value: LoadBalancingMode; label: string }[] = [
    { value: 'priority', label: 'Priority' },
    { value: 'balanced', label: 'Balanced' },
    { value: 'round-robin', label: 'Round-robin' },
  ]

  const handleSetLoadBalancing = (newMode: LoadBalancingMode) => {
    if (newMode === loadBalancingData?.mode) return
    const modeNameMap: Record<string, string> = {
      priority: 'Priority mode',
      balanced: 'Balanced mode',
      'round-robin': 'Round-robin mode',
    }
    setLoadBalancingMode(newMode, {
      onSuccess: () => {
        toast.success(`Switched to ${modeNameMap[newMode] ?? newMode}`)
      },
      onError: (error) => {
        toast.error(`Switch failed: ${extractErrorMessage(error)}`)
      }
    })
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <div className="text-destructive mb-4">Load failed</div>
            <p className="text-muted-foreground mb-4">{(error as Error).message}</p>
            <div className="space-x-2">
              <Button onClick={() => refetch()}>Retry</Button>
              <Button variant="outline" onClick={handleLogout}>Re-login</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Top navigation */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center justify-between gap-3 px-4 md:px-8">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <Server className="h-4 w-4" />
              </div>
              <span className="hidden font-semibold sm:inline">Kiro Admin</span>
            </div>
            {/* Main view switch: Monitor / Credentials */}
            <div className="flex items-center rounded-md border bg-muted/40 p-0.5">
              {MAIN_TABS.map((t) => {
                const active = mainTab === t.value
                const Icon = t.icon
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setMainTab(t.value as MainTab)}
                    className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                      active
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {Icon && <Icon className="h-3.5 w-3.5" />}
                    <span className="hidden sm:inline">{t.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Load balancing mode segmented control */}
            <div className="hidden items-center rounded-md border bg-muted/40 p-0.5 sm:flex">
              {loadBalancingModes.map((m) => {
                const active = loadBalancingData?.mode === m.value
                return (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => handleSetLoadBalancing(m.value)}
                    disabled={isLoadingMode || isSettingMode}
                    className={`rounded px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                      active
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {m.label}
                  </button>
                )
              })}
            </div>
            <div className="mx-1 hidden h-6 w-px bg-border sm:block" />
            {DESKTOP && appVersion && (
              <span
                className="hidden text-xs tabular-nums text-muted-foreground sm:inline"
                title={`Current version ${appVersion}`}
              >
                v{appVersion}
              </span>
            )}
            {DESKTOP && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => (updateInfo?.hasUpdate ? openReleasePage(updateInfo) : handleCheckUpdate(false))}
                disabled={checkingUpdate}
                title={
                  updateInfo?.hasUpdate
                    ? `New version ${updateInfo.latestVersion} available, click to download`
                    : 'Check for updates'
                }
              >
                <DownloadCloud
                  className={`h-5 w-5 ${checkingUpdate ? 'animate-pulse' : ''} ${
                    updateInfo?.hasUpdate ? 'text-green-500' : ''
                  }`}
                />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              title="GitHub Repository"
              onClick={() => {
                openUrl('https://github.com/ykn1002/kiro.rs').catch((e) =>
                  toast.error(`Failed to open: ${extractErrorMessage(e)}`)
                )
              }}
            >
              <Github className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setSettingsDialogOpen(true)} title="Settings">
              <Settings className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={toggleDarkMode} title={darkMode ? 'Switch to light' : 'Switch to dark'}>
              {darkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={handleRefresh} title="Refresh credentials">
              <RefreshCw className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={handleLogout} title="Logout">
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="container mx-auto px-4 md:px-8 py-6 space-y-6">
        {/* Monitor */}
        {mainTab === 'monitor' && (
          <div className="space-y-3">
            <MonitorPanel />
            <UsageTrendsPanel />
          </div>
        )}

        {/* Logs (desktop only) */}
        {DESKTOP && mainTab === 'logs' && <LogPanel />}

        {/* Credentials list */}
        <div className={`space-y-4 ${mainTab === 'credentials' ? '' : 'hidden'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {selectedIds.size > 0 && (
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">Selected {selectedIds.size}</Badge>
                  <Button onClick={deselectAll} size="sm" variant="ghost">
                    Deselect
                  </Button>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              {selectedIds.size > 0 && (
                <>
                  <Button onClick={handleBatchVerify} size="sm" variant="outline">
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Batch Verify
                  </Button>
                  <Button
                    onClick={handleBatchForceRefresh}
                    size="sm"
                    variant="outline"
                    disabled={batchRefreshing}
                  >
                    <RefreshCw className={`h-4 w-4 mr-2 ${batchRefreshing ? 'animate-spin' : ''}`} />
                    {batchRefreshing ? `Refreshing... ${batchRefreshProgress.current}/${batchRefreshProgress.total}` : 'Batch Refresh Tokens'}
                  </Button>
                  <Button onClick={handleBatchResetFailure} size="sm" variant="outline">
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Reset Failures
                  </Button>
                  <Button
                    onClick={handleBatchDelete}
                    size="sm"
                    variant="destructive"
                    disabled={selectedDisabledCount === 0}
                    title={selectedDisabledCount === 0 ? 'Only disabled credentials can be deleted' : undefined}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Batch Delete
                  </Button>
                </>
              )}
              {verifying && !verifyDialogOpen && (
                <Button onClick={() => setVerifyDialogOpen(true)} size="sm" variant="secondary">
                  <CheckCircle2 className="h-4 w-4 mr-2 animate-spin" />
                  Verifying... {verifyProgress.current}/{verifyProgress.total}
                </Button>
              )}
              {data?.credentials && data.credentials.length > 0 && (
                <Button
                  onClick={() => handleQueryCurrentPageInfo()}
                  size="sm"
                  variant="outline"
                  disabled={queryingInfo}
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${queryingInfo ? 'animate-spin' : ''}`} />
                  {queryingInfo ? `Querying... ${queryInfoProgress.current}/${queryInfoProgress.total}` : 'Query Info'}
                </Button>
              )}
              {data?.credentials && data.credentials.length > 0 && (
                <Button
                  onClick={handleClearAll}
                  size="sm"
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  disabled={disabledCredentialCount === 0}
                  title={disabledCredentialCount === 0 ? 'No disabled credentials to clear' : undefined}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear Disabled
                </Button>
              )}
              <Button onClick={() => setKamImportDialogOpen(true)} size="sm" variant="outline">
                <FileUp className="h-4 w-4 mr-2" />
                Kiro Account Manager Import
              </Button>
              <Button onClick={() => setAwsSsoImportDialogOpen(true)} size="sm" variant="outline">
                <FileUp className="h-4 w-4 mr-2" />
                AWS SSO Import
              </Button>
              <Button onClick={() => setBatchImportDialogOpen(true)} size="sm" variant="outline">
                <Upload className="h-4 w-4 mr-2" />
                Batch Import
              </Button>
              <Button onClick={handleExport} size="sm" variant="outline" title="Download all credentials as a JSON backup (includes secrets)">
                <FileDown className="h-4 w-4 mr-2" />
                Export
              </Button>
              <Button onClick={() => fileInputRef.current?.click()} size="sm" variant="outline" disabled={importingFile} title="Restore credentials from a JSON backup file">
                <FileUp className="h-4 w-4 mr-2" />
                {importingFile ? 'Importing...' : 'Import File'}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={handleImportFileChange}
              />
              <Button onClick={() => setAddDialogOpen(true)} size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add Credential
              </Button>
            </div>
          </div>
          {data?.credentials.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No credentials
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {currentCredentials.map((credential) => (
                  <CredentialCard
                    key={credential.id}
                    credential={credential}
                    onViewBalance={handleViewBalance}
                    selected={selectedIds.has(credential.id)}
                    onToggleSelect={() => toggleSelect(credential.id)}
                    balance={balanceMap.get(credential.id) || null}
                    loadingBalance={loadingBalanceIds.has(credential.id)}
                  />
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex justify-center items-center gap-4 mt-6">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    Previous
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Page {currentPage} / {totalPages} ({data?.credentials.length} credentials)
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                  >
                    Next
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {/* Balance dialog */}
      <BalanceDialog
        credentialId={selectedCredentialId}
        open={balanceDialogOpen}
        onOpenChange={setBalanceDialogOpen}
      />

      {/* Add credential dialog */}
      <AddCredentialDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
      />

      {/* Batch import dialog */}
      <BatchImportDialog
        open={batchImportDialogOpen}
        onOpenChange={setBatchImportDialogOpen}
      />

      {/* KAM account import dialog */}
      <KamImportDialog
        open={kamImportDialogOpen}
        onOpenChange={setKamImportDialogOpen}
      />

      {/* AWS SSO import dialog */}
      <AwsSsoImportDialog
        open={awsSsoImportDialogOpen}
        onOpenChange={setAwsSsoImportDialogOpen}
      />

      {/* Settings dialog */}
      <SettingsDialog
        open={settingsDialogOpen}
        onOpenChange={setSettingsDialogOpen}
      />

      {/* Batch verify dialog */}
      <BatchVerifyDialog
        open={verifyDialogOpen}
        onOpenChange={setVerifyDialogOpen}
        verifying={verifying}
        progress={verifyProgress}
        results={verifyResults}
        onCancel={handleCancelVerify}
      />
    </div>
  )
}
