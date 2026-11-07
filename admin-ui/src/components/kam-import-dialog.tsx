import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import { CheckCircle2, XCircle, AlertCircle, Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useCredentials, useAddCredential, useDeleteCredential } from '@/hooks/use-credentials'
import { getCredentialBalance, setCredentialDisabled } from '@/api/credentials'
import { extractErrorMessage, sha256Hex } from '@/lib/utils'

interface KamImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

// Account shape inside a KAM export JSON
interface KamAccount {
  email?: string
  userId?: string | null
  nickname?: string
  credentials: {
    refreshToken: string
    accessToken?: string
    profileArn?: string
    expiresAt?: string | number
    clientId?: string
    clientSecret?: string
    region?: string
    authMethod?: string
    provider?: string
    startUrl?: string
    tokenEndpoint?: string
    issuerUrl?: string
    scopes?: string
  }
  machineId?: string
  status?: string
}

interface VerificationResult {
  index: number
  status: 'pending' | 'checking' | 'verifying' | 'verified' | 'duplicate' | 'failed' | 'skipped'
  error?: string
  usage?: string
  email?: string
  credentialId?: number
  rollbackStatus?: 'success' | 'failed' | 'skipped'
  rollbackError?: string
}



// Support the new flat format of KAM 1.8.3 by normalizing it to the legacy nested-credentials shape
function normalizeKamAccount(item: unknown): unknown {
  if (typeof item !== 'object' || item === null) return item
  const obj = item as Record<string, unknown>
  // New format: refreshToken sits directly on the account object with no nested credentials
  if (typeof obj.refreshToken === 'string' && typeof obj.credentials === 'undefined') {
    const email = typeof obj.email === 'string' ? obj.email : undefined
    const userId =
      typeof obj.userId === 'string' || obj.userId === null ? (obj.userId as string | null) : undefined
    const nickname =
      typeof obj.nickname === 'string'
        ? obj.nickname
        : typeof obj.label === 'string'
          ? (obj.label as string)
          : undefined
    const status = typeof obj.status === 'string' ? obj.status : undefined
    const machineId = typeof obj.machineId === 'string' ? obj.machineId : undefined
    const accessToken = typeof obj.accessToken === 'string' ? obj.accessToken : undefined
    const profileArn = typeof obj.profileArn === 'string' ? obj.profileArn : undefined
    const expiresAt =
      typeof obj.expiresAt === 'string' || typeof obj.expiresAt === 'number'
        ? (obj.expiresAt as string | number)
        : undefined
    const clientId = typeof obj.clientId === 'string' ? obj.clientId : undefined
    const clientSecret = typeof obj.clientSecret === 'string' ? obj.clientSecret : undefined
    const region = typeof obj.region === 'string' ? obj.region : undefined
    const authMethod = typeof obj.authMethod === 'string' ? obj.authMethod : undefined
    const provider = typeof obj.provider === 'string' ? obj.provider : undefined
    const startUrl = typeof obj.startUrl === 'string' ? obj.startUrl : undefined
    const tokenEndpoint = typeof obj.tokenEndpoint === 'string' ? obj.tokenEndpoint : undefined
    const issuerUrl = typeof obj.issuerUrl === 'string' ? obj.issuerUrl : undefined
    const scopes = typeof obj.scopes === 'string' ? obj.scopes : undefined

    return {
      email,
      userId,
      nickname,
      status,
      machineId,
      credentials: {
        refreshToken: obj.refreshToken,
        accessToken,
        profileArn,
        expiresAt,
        clientId,
        clientSecret,
        region,
        authMethod,
        provider,
        startUrl,
        tokenEndpoint,
        issuerUrl,
        scopes,
      },
    }
  }
  return item
}

// Check whether an element is a valid KAM account shape
function isValidKamAccount(item: unknown): item is KamAccount {
  if (typeof item !== 'object' || item === null) return false
  const obj = item as Record<string, unknown>
  if (typeof obj.credentials !== 'object' || obj.credentials === null) return false
  const cred = obj.credentials as Record<string, unknown>
  return typeof cred.refreshToken === 'string' && cred.refreshToken.trim().length > 0
}

// Parse a KAM export JSON; supports single- and multi-account formats
function parseKamJson(raw: string): KamAccount[] {
  const parsed = JSON.parse(raw)

  let rawItems: unknown[]

  // Standard KAM export format: { version, accounts: [...] }
  if (parsed.accounts && Array.isArray(parsed.accounts)) {
    rawItems = parsed.accounts
  }
  // Plain array (including the new flat format of KAM 1.8.3)
  else if (Array.isArray(parsed)) {
    rawItems = parsed
  }
  // Single account object (legacy format with a credentials field)
  else if (parsed.credentials && typeof parsed.credentials === 'object') {
    rawItems = [parsed]
  }
  // Single account object (new format with a flat refreshToken)
  else if (typeof parsed.refreshToken === 'string') {
    rawItems = [parsed]
  }
  else {
    throw new Error('Unrecognized KAM JSON format')
  }

  // Support the new format: normalize flat accounts into the nested credentials shape
  const normalizedItems = rawItems.map(normalizeKamAccount)
  const validAccounts = normalizedItems.filter(isValidKamAccount)

  if (rawItems.length > 0 && validAccounts.length === 0) {
    throw new Error(`${rawItems.length} records found, but none has a valid credentials.refreshToken`)
  }

  if (validAccounts.length < rawItems.length) {
    const skipped = rawItems.length - validAccounts.length
    console.warn(`KAM import: skipping ${skipped} records without a valid credentials.refreshToken`)
  }

  return validAccounts
}

export function KamImportDialog({ open, onOpenChange }: KamImportDialogProps) {
  const [jsonInput, setJsonInput] = useState('')
  const [importing, setImporting] = useState(false)
  const [skipErrorAccounts, setSkipErrorAccounts] = useState(true)
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [currentProcessing, setCurrentProcessing] = useState<string>('')
  const [results, setResults] = useState<VerificationResult[]>([])

  const { data: existingCredentials } = useCredentials()
  const { mutateAsync: addCredential } = useAddCredential()
  const { mutateAsync: deleteCredential } = useDeleteCredential()

  const rollbackCredential = async (id: number): Promise<{ success: boolean; error?: string }> => {
    try {
      await setCredentialDisabled(id, true)
    } catch (error) {
      return { success: false, error: `Failed to disable: ${extractErrorMessage(error)}` }
    }
    try {
      await deleteCredential(id)
      return { success: true }
    } catch (error) {
      return { success: false, error: `Failed to delete: ${extractErrorMessage(error)}` }
    }
  }

  const resetForm = () => {
    setJsonInput('')
    setProgress({ current: 0, total: 0 })
    setCurrentProcessing('')
    setResults([])
  }

  const handleImport = async () => {
    // Parse the JSON separately first so the error message is precise
    let validAccounts: KamAccount[]
    try {
      const accounts = parseKamJson(jsonInput)

      if (accounts.length === 0) {
        toast.error('No accounts to import')
        return
      }

      validAccounts = accounts.filter(a => a.credentials?.refreshToken)
      if (validAccounts.length === 0) {
        toast.error('No account contains a valid refreshToken')
        return
      }
    } catch (error) {
      toast.error('Invalid JSON: ' + extractErrorMessage(error))
      return
    }

    try {

      setImporting(true)
      setProgress({ current: 0, total: validAccounts.length })

      // Initialize the results and flag accounts whose status is error
      const initialResults: VerificationResult[] = validAccounts.map((account, i) => {
        if (skipErrorAccounts && account.status === 'error') {
          return { index: i + 1, status: 'skipped' as const, email: account.email || account.nickname }
        }
        return { index: i + 1, status: 'pending' as const, email: account.email || account.nickname }
      })
      setResults(initialResults)

      // Duplicate detection
      const existingTokenHashes = new Set(
        existingCredentials?.credentials
          .map(c => c.refreshTokenHash)
          .filter((hash): hash is string => Boolean(hash)) || []
      )

      let successCount = 0
      let duplicateCount = 0
      let failCount = 0
      let skippedCount = 0

      for (let i = 0; i < validAccounts.length; i++) {
        const account = validAccounts[i]

        // Skip accounts whose status is error
        if (skipErrorAccounts && account.status === 'error') {
          skippedCount++
          setProgress({ current: i + 1, total: validAccounts.length })
          continue
        }

        const cred = account.credentials
        const token = cred.refreshToken.trim()
        const tokenHash = await sha256Hex(token)

        setCurrentProcessing(`Processing ${account.email || account.nickname || `account ${i + 1}`}`)
        setResults(prev => {
          const next = [...prev]
          next[i] = { ...next[i], status: 'checking' }
          return next
        })

        // Check for duplicates
        if (existingTokenHashes.has(tokenHash)) {
          duplicateCount++
          const existingCred = existingCredentials?.credentials.find(c => c.refreshTokenHash === tokenHash)
          setResults(prev => {
            const next = [...prev]
            next[i] = { ...next[i], status: 'duplicate', error: 'This credential already exists', email: existingCred?.email || account.email }
            return next
          })
          setProgress({ current: i + 1, total: validAccounts.length })
          continue
        }

        // Verifying
        setResults(prev => {
          const next = [...prev]
          next[i] = { ...next[i], status: 'verifying' }
          return next
        })

        let addedCredId: number | null = null

        try {
          const clientId = cred.clientId?.trim() || undefined
          const clientSecret = cred.clientSecret?.trim() || undefined
          const rawAuthMethod = cred.authMethod?.trim().toLowerCase()
          const authMethod =
            rawAuthMethod === 'idc' ||
            rawAuthMethod === 'builder-id' ||
            rawAuthMethod === 'iam' ||
            (clientId && clientSecret)
              ? 'idc'
              : 'social'

          // idc mode requires both clientId and clientSecret
          if (authMethod === 'idc' && (!clientId || !clientSecret)) {
            throw new Error('idc mode requires both clientId and clientSecret')
          }

          const expiresAt =
            typeof cred.expiresAt === 'number'
              ? new Date(cred.expiresAt).toISOString()
              : cred.expiresAt?.trim() || undefined

          const addedCred = await addCredential({
            name: account.nickname?.trim() || undefined,
            email: account.email?.trim() || undefined,
            refreshToken: token,
            accessToken: cred.accessToken?.trim() || undefined,
            profileArn: cred.profileArn?.trim() || undefined,
            expiresAt,
            authMethod,
            authRegion: cred.region?.trim() || undefined,
            clientId,
            clientSecret,
            provider: cred.provider?.trim() || undefined,
            startUrl: cred.startUrl?.trim() || undefined,
            tokenEndpoint: cred.tokenEndpoint?.trim() || undefined,
            issuerUrl: cred.issuerUrl?.trim() || undefined,
            scopes: cred.scopes?.trim() || undefined,
            machineId: account.machineId?.trim() || undefined,
          })

          addedCredId = addedCred.credentialId

          await new Promise(resolve => setTimeout(resolve, 1000))

          const balance = await getCredentialBalance(addedCred.credentialId)

          successCount++
          existingTokenHashes.add(tokenHash)
          setCurrentProcessing(`Verified: ${addedCred.email || account.email || `account ${i + 1}`}`)
          setResults(prev => {
            const next = [...prev]
            next[i] = {
              ...next[i],
              status: 'verified',
              usage: `${balance.currentUsage}/${balance.usageLimit}`,
              email: addedCred.email || account.email,
              credentialId: addedCred.credentialId,
            }
            return next
          })
        } catch (error) {
          let rollbackStatus: VerificationResult['rollbackStatus'] = 'skipped'
          let rollbackError: string | undefined

          if (addedCredId) {
            const result = await rollbackCredential(addedCredId)
            if (result.success) {
              rollbackStatus = 'success'
            } else {
              rollbackStatus = 'failed'
              rollbackError = result.error
            }
          }

          failCount++
          setResults(prev => {
            const next = [...prev]
            next[i] = {
              ...next[i],
              status: 'failed',
              error: extractErrorMessage(error),
              rollbackStatus,
              rollbackError,
            }
            return next
          })
        }

        setProgress({ current: i + 1, total: validAccounts.length })
      }

      // Summary
      const parts: string[] = []
      if (successCount > 0) parts.push(`${successCount} succeeded`)
      if (duplicateCount > 0) parts.push(`${duplicateCount} duplicated`)
      if (failCount > 0) parts.push(`${failCount} failed`)
      if (skippedCount > 0) parts.push(`${skippedCount} skipped`)

      if (failCount === 0 && duplicateCount === 0 && skippedCount === 0) {
        toast.success(`Imported and verified ${successCount} credentials`)
      } else {
        toast.info(`Import finished: ${parts.join(', ')}`)
      }
    } catch (error) {
      toast.error('Import failed: ' + extractErrorMessage(error))
    } finally {
      setImporting(false)
    }
  }

  const getStatusIcon = (status: VerificationResult['status']) => {
    switch (status) {
      case 'pending':
        return <div className="w-5 h-5 rounded-full border-2 border-gray-300" />
      case 'checking':
      case 'verifying':
        return <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
      case 'verified':
        return <CheckCircle2 className="w-5 h-5 text-green-500" />
      case 'duplicate':
        return <AlertCircle className="w-5 h-5 text-yellow-500" />
      case 'skipped':
        return <AlertCircle className="w-5 h-5 text-gray-400" />
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-500" />
    }
  }

  const getStatusText = (result: VerificationResult) => {
    switch (result.status) {
      case 'pending': return 'Pending'
      case 'checking': return 'Checking for duplicates...'
      case 'verifying': return 'Verifying...'
      case 'verified': return 'Verified'
      case 'duplicate': return 'Duplicate credential'
      case 'skipped': return 'Skipped (error status)'
      case 'failed':
        if (result.rollbackStatus === 'success') return 'Verification failed (cleaned up)'
        if (result.rollbackStatus === 'failed') return 'Verification failed (not cleaned up)'
        return 'Verification failed (not created)'
    }
  }

  // Preview the parsed result
  const { previewAccounts, parseError } = useMemo(() => {
    if (!jsonInput.trim()) return { previewAccounts: [] as KamAccount[], parseError: '' }
    try {
      return { previewAccounts: parseKamJson(jsonInput), parseError: '' }
    } catch (e) {
      return { previewAccounts: [] as KamAccount[], parseError: extractErrorMessage(e) }
    }
  }, [jsonInput])

  const errorAccountCount = previewAccounts.filter(a => a.status === 'error').length

  return (
    <Dialog
      open={open}
      onOpenChange={(newOpen) => {
        if (!newOpen && importing) return
        if (!newOpen) resetForm()
        onOpenChange(newOpen)
      }}
    >
      <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>KAM Account Import (auto-verify)</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">KAM export JSON</label>
            <textarea
              placeholder={'Paste the JSON exported by Kiro Account Manager\n\nThe new flat format of KAM 1.8.3+ is supported:\n[\n  {\n    "email": "...",\n    "refreshToken": "...",\n    "clientId": "...",\n    "clientSecret": "...",\n    "region": "us-east-1"\n  }\n]\n\n(An optional authMethod field is ignored; the system infers the method from clientId/clientSecret)\n\nThe legacy nested format is also supported:\n{\n  "version": "1.5.0",\n  "accounts": [\n    {\n      "email": "...",\n      "credentials": {\n        "refreshToken": "...",\n        "clientId": "...",\n        "clientSecret": "...",\n        "region": "us-east-1"\n      }\n    }\n  ]\n}'}
              value={jsonInput}
              onChange={(e) => setJsonInput(e.target.value)}
              disabled={importing}
              className="flex min-h-[200px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono"
            />
          </div>

          {/* Parse preview */}
          {parseError && (
            <div className="text-sm text-red-600 dark:text-red-400">Parse failed: {parseError}</div>
          )}
          {previewAccounts.length > 0 && !importing && results.length === 0 && (
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">
                {previewAccounts.length} accounts detected
                {errorAccountCount > 0 && ` (${errorAccountCount} of them have an error status)`}
              </div>
              {errorAccountCount > 0 && (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={skipErrorAccounts}
                    onChange={(e) => setSkipErrorAccounts(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  Skip accounts whose status is error
                </label>
              )}
            </div>
          )}

          {/* Import progress and results */}
          {(importing || results.length > 0) && (
            <>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>{importing ? 'Import progress' : 'Import complete'}</span>
                  <span>{progress.current} / {progress.total}</span>
                </div>
                <div className="w-full bg-secondary rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full transition-all"
                    style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
                  />
                </div>
                {importing && currentProcessing && (
                  <div className="text-xs text-muted-foreground">{currentProcessing}</div>
                )}
              </div>

              <div className="flex gap-4 text-sm">
                <span className="text-green-600 dark:text-green-400">
                  ✓ Succeeded: {results.filter(r => r.status === 'verified').length}
                </span>
                <span className="text-yellow-600 dark:text-yellow-400">
                  ⚠ Duplicated: {results.filter(r => r.status === 'duplicate').length}
                </span>
                <span className="text-red-600 dark:text-red-400">
                  ✗ Failed: {results.filter(r => r.status === 'failed').length}
                </span>
                <span className="text-gray-500">
                  ○ Skipped: {results.filter(r => r.status === 'skipped').length}
                </span>
              </div>

              <div className="border rounded-md divide-y max-h-[300px] overflow-y-auto">
                {results.map((result) => (
                  <div key={result.index} className="p-3">
                    <div className="flex items-start gap-3">
                      {getStatusIcon(result.status)}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">
                            {result.email || `Account #${result.index}`}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {getStatusText(result)}
                          </span>
                        </div>
                        {result.usage && (
                          <div className="text-xs text-muted-foreground mt-1">Usage: {result.usage}</div>
                        )}
                        {result.error && (
                          <div className="text-xs text-red-600 dark:text-red-400 mt-1">{result.error}</div>
                        )}
                        {result.rollbackError && (
                          <div className="text-xs text-red-600 dark:text-red-400 mt-1">Rollback failed: {result.rollbackError}</div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => { onOpenChange(false); resetForm() }}
            disabled={importing}
          >
            {importing ? 'Importing...' : results.length > 0 ? 'Close' : 'Cancel'}
          </Button>
          {results.length === 0 && (
            <Button
              type="button"
              onClick={handleImport}
              disabled={importing || !jsonInput.trim() || previewAccounts.length === 0 || !!parseError}
            >
              Start import and verify
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
