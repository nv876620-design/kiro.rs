import { useState } from 'react'
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
import { normalizeCredentialImportItems } from '@/lib/credential-import'

interface BatchImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface CredentialInput {
  refreshToken?: string
  clientId?: string
  clientSecret?: string
  region?: string
  authRegion?: string
  apiRegion?: string
  priority?: number
  machineId?: string
  kiroApiKey?: string
  authMethod?: string
  endpoint?: string
}

interface VerificationResult {
  index: number
  status: 'pending' | 'checking' | 'verifying' | 'verified' | 'duplicate' | 'failed'
  error?: string
  usage?: string
  email?: string
  credentialId?: number
  rollbackStatus?: 'success' | 'failed' | 'skipped'
  rollbackError?: string
}



export function BatchImportDialog({ open, onOpenChange }: BatchImportDialogProps) {
  const [jsonInput, setJsonInput] = useState('')
  const [importing, setImporting] = useState(false)
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
      return {
        success: false,
        error: `Failed to disable: ${extractErrorMessage(error)}`,
      }
    }

    try {
      await deleteCredential(id)
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: `Failed to delete: ${extractErrorMessage(error)}`,
      }
    }
  }

  const resetForm = () => {
    setJsonInput('')
    setProgress({ current: 0, total: 0 })
    setCurrentProcessing('')
    setResults([])
  }

  const handleBatchImport = async () => {
    // Parse the JSON separately first so the error message is precise
    let credentials: CredentialInput[]
    try {
      const parsed = JSON.parse(jsonInput)
      credentials = normalizeCredentialImportItems(parsed) as CredentialInput[]
    } catch (error) {
      toast.error('Invalid JSON: ' + extractErrorMessage(error))
      return
    }

    if (credentials.length === 0) {
      toast.error('No credentials to import')
      return
    }

    try {
      setImporting(true)
      setProgress({ current: 0, total: credentials.length })

      // 2. Initialize the results
      const initialResults: VerificationResult[] = credentials.map((_, i) => ({
        index: i + 1,
        status: 'pending'
      }))
      setResults(initialResults)

      // 3. Duplicate detection: OAuth and API Keys each use their own hash set
      const existingOauthHashes = new Set(
        existingCredentials?.credentials
          .map(c => c.refreshTokenHash)
          .filter((hash): hash is string => Boolean(hash)) || []
      )
      const existingApiKeyHashes = new Set(
        existingCredentials?.credentials
          .map(c => c.apiKeyHash)
          .filter((hash): hash is string => Boolean(hash)) || []
      )

      let successCount = 0
      let duplicateCount = 0
      let failCount = 0
      let rollbackSuccessCount = 0
      let rollbackFailedCount = 0
      let rollbackSkippedCount = 0

      // 4. Import and verify
      for (let i = 0; i < credentials.length; i++) {
        const cred = credentials[i]
        const isApiKeyCred = !!(cred.kiroApiKey?.trim()) || cred.authMethod === 'api_key'

        // Mark the status as checking
        setCurrentProcessing(`Processing credential ${i + 1}/${credentials.length}`)
        setResults(prev => {
          const newResults = [...prev]
          newResults[i] = { ...newResults[i], status: 'checking' }
          return newResults
        })

        // Client-side dedupe: OAuth by refreshToken hash, API Key by kiroApiKey hash
        let credHash = ''
        if (isApiKeyCred) {
          const apiKey = cred.kiroApiKey?.trim() || ''
          if (!apiKey) {
            setResults(prev => {
              const newResults = [...prev]
              newResults[i] = {
                ...newResults[i],
                status: 'failed',
                error: 'Missing kiroApiKey',
              }
              return newResults
            })
            failCount++
            setProgress({ current: i + 1, total: credentials.length })
            continue
          }
          credHash = await sha256Hex(apiKey)
          if (existingApiKeyHashes.has(credHash)) {
            duplicateCount++
            const existingCred = existingCredentials?.credentials.find(c => c.apiKeyHash === credHash)
            setResults(prev => {
              const newResults = [...prev]
              newResults[i] = {
                ...newResults[i],
                status: 'duplicate',
                error: 'This credential already exists',
                email: existingCred?.email || undefined
              }
              return newResults
            })
            setProgress({ current: i + 1, total: credentials.length })
            continue
          }
        } else {
          const token = cred.refreshToken?.trim() || ''
          if (!token) {
            setResults(prev => {
              const newResults = [...prev]
              newResults[i] = {
                ...newResults[i],
                status: 'failed',
                error: 'Missing refreshToken',
              }
              return newResults
            })
            failCount++
            setProgress({ current: i + 1, total: credentials.length })
            continue
          }
          credHash = await sha256Hex(token)
          if (existingOauthHashes.has(credHash)) {
            duplicateCount++
            const existingCred = existingCredentials?.credentials.find(c => c.refreshTokenHash === credHash)
            setResults(prev => {
              const newResults = [...prev]
              newResults[i] = {
                ...newResults[i],
                status: 'duplicate',
                error: 'This credential already exists',
                email: existingCred?.email || undefined
              }
              return newResults
            })
            setProgress({ current: i + 1, total: credentials.length })
            continue
          }
        }

        // Mark the status as verifying
        setResults(prev => {
          const newResults = [...prev]
          newResults[i] = { ...newResults[i], status: 'verifying' }
          return newResults
        })

        let addedCredId: number | null = null

        try {
          // Add the credential
          if (isApiKeyCred) {
            // API Key credential
            const addedCred = await addCredential({
              authMethod: 'api_key',
              kiroApiKey: cred.kiroApiKey?.trim(),
              priority: cred.priority || 0,
              authRegion: cred.authRegion?.trim() || cred.region?.trim() || undefined,
              apiRegion: cred.apiRegion?.trim() || undefined,
              machineId: cred.machineId?.trim() || undefined,
              endpoint: cred.endpoint?.trim() || undefined,
            })

            addedCredId = addedCred.credentialId

            // Wait 1 second
            await new Promise(resolve => setTimeout(resolve, 1000))

            // Verify
            const balance = await getCredentialBalance(addedCred.credentialId)

            successCount++
            existingApiKeyHashes.add(credHash)
            setCurrentProcessing(addedCred.email ? `Verified: ${addedCred.email}` : `Verified: credential ${i + 1}`)
            setResults(prev => {
              const newResults = [...prev]
              newResults[i] = {
                ...newResults[i],
                status: 'verified',
                usage: `${balance.currentUsage}/${balance.usageLimit}`,
                email: addedCred.email || undefined,
                credentialId: addedCred.credentialId
              }
              return newResults
            })
            setProgress({ current: i + 1, total: credentials.length })
            continue
          }

          // OAuth credential
          const token = cred.refreshToken!.trim()
          const clientId = cred.clientId?.trim() || undefined
          const clientSecret = cred.clientSecret?.trim() || undefined
          const authMethod = clientId && clientSecret ? 'idc' : 'social'

          // idc mode requires both clientId and clientSecret
          if (authMethod === 'social' && (clientId || clientSecret)) {
            throw new Error('idc mode requires both clientId and clientSecret')
          }

          const addedCred = await addCredential({
            refreshToken: token,
            authMethod,
            authRegion: cred.authRegion?.trim() || cred.region?.trim() || undefined,
            apiRegion: cred.apiRegion?.trim() || undefined,
            clientId,
            clientSecret,
            priority: cred.priority || 0,
            machineId: cred.machineId?.trim() || undefined,
            endpoint: cred.endpoint?.trim() || undefined,
          })

          addedCredId = addedCred.credentialId

          // Wait 1 second
          await new Promise(resolve => setTimeout(resolve, 1000))

          // Verify
          const balance = await getCredentialBalance(addedCred.credentialId)

          // Verification succeeded
          successCount++
          existingOauthHashes.add(credHash)
          setCurrentProcessing(addedCred.email ? `Verified: ${addedCred.email}` : `Verified: credential ${i + 1}`)
          setResults(prev => {
            const newResults = [...prev]
            newResults[i] = {
              ...newResults[i],
              status: 'verified',
              usage: `${balance.currentUsage}/${balance.usageLimit}`,
              email: addedCred.email || undefined,
              credentialId: addedCred.credentialId
            }
            return newResults
          })
        } catch (error) {
          // Verification failed; try to roll back (disable first, then delete)
          let rollbackStatus: VerificationResult['rollbackStatus'] = 'skipped'
          let rollbackError: string | undefined

          if (addedCredId) {
            const rollbackResult = await rollbackCredential(addedCredId)
            if (rollbackResult.success) {
              rollbackStatus = 'success'
              rollbackSuccessCount++
            } else {
              rollbackStatus = 'failed'
              rollbackFailedCount++
              rollbackError = rollbackResult.error
            }
          } else {
            rollbackSkippedCount++
          }

          failCount++
          setResults(prev => {
            const newResults = [...prev]
            newResults[i] = {
              ...newResults[i],
              status: 'failed',
              error: extractErrorMessage(error),
              email: undefined,
              rollbackStatus,
              rollbackError,
            }
            return newResults
          })
        }

        setProgress({ current: i + 1, total: credentials.length })
      }

      // Show the results
      if (failCount === 0 && duplicateCount === 0) {
        toast.success(`Imported and verified ${successCount} credentials`)
      } else {
        const failureSummary = failCount > 0
          ? `, ${failCount} failed (${rollbackSuccessCount} cleaned up, ${rollbackFailedCount} not cleaned up, ${rollbackSkippedCount} needed no cleanup)`
          : ''
        toast.info(`Verification finished: ${successCount} succeeded, ${duplicateCount} duplicated${failureSummary}`)

        if (rollbackFailedCount > 0) {
          toast.warning(`${rollbackFailedCount} failed credentials were not rolled back; disable and delete them manually`)
        }
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
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-500" />
    }
  }

  const getStatusText = (result: VerificationResult) => {
    switch (result.status) {
      case 'pending':
        return 'Pending'
      case 'checking':
        return 'Checking for duplicates...'
      case 'verifying':
        return 'Verifying...'
      case 'verified':
        return 'Verified'
      case 'duplicate':
        return 'Duplicate credential'
      case 'failed':
        if (result.rollbackStatus === 'success') return 'Verification failed (cleaned up)'
        if (result.rollbackStatus === 'failed') return 'Verification failed (not cleaned up)'
        return 'Verification failed (not created)'
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(newOpen) => {
        // Clear the form on close (but not while an import is running)
        if (!newOpen && !importing) {
          resetForm()
        }
        onOpenChange(newOpen)
      }}
    >
      <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Batch Import Credentials (auto-verify)</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Credentials as JSON
            </label>
            <textarea
              placeholder={'Paste credentials as JSON (a single object or an array)\n\nOAuth: [{"refreshToken":"...","clientId":"...","clientSecret":"..."}]\nAPI Key: [{"kiroApiKey":"ksk_xxx"}]\n\nThe region field is automatically mapped to authRegion'}
              value={jsonInput}
              onChange={(e) => setJsonInput(e.target.value)}
              disabled={importing}
              className="flex min-h-[200px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono"
            />
            <p className="text-xs text-muted-foreground">
              💡 Credentials are verified on import and failures are rolled back automatically
            </p>
          </div>

          {(importing || results.length > 0) && (
            <>
              {/* Progress bar */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>{importing ? 'Verification progress' : 'Verification complete'}</span>
                  <span>{progress.current} / {progress.total}</span>
                </div>
                <div className="w-full bg-secondary rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full transition-all"
                    style={{ width: `${(progress.current / progress.total) * 100}%` }}
                  />
                </div>
                {importing && currentProcessing && (
                  <div className="text-xs text-muted-foreground">
                    {currentProcessing}
                  </div>
                )}
              </div>

              {/* Summary counters */}
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
              </div>

              {/* Result list */}
              <div className="border rounded-md divide-y max-h-[300px] overflow-y-auto">
                {results.map((result) => (
                  <div key={result.index} className="p-3">
                    <div className="flex items-start gap-3">
                      {getStatusIcon(result.status)}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">
                            {result.email || `Credential #${result.index}`}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {getStatusText(result)}
                          </span>
                        </div>
                        {result.usage && (
                          <div className="text-xs text-muted-foreground mt-1">
                            Usage: {result.usage}
                          </div>
                        )}
                        {result.error && (
                          <div className="text-xs text-red-600 dark:text-red-400 mt-1">
                            {result.error}
                          </div>
                        )}
                        {result.rollbackError && (
                          <div className="text-xs text-red-600 dark:text-red-400 mt-1">
                            Rollback failed: {result.rollbackError}
                          </div>
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
            onClick={() => {
              onOpenChange(false)
              resetForm()
            }}
            disabled={importing}
          >
            {importing ? 'Verifying...' : results.length > 0 ? 'Close' : 'Cancel'}
          </Button>
          {results.length === 0 && (
            <Button
              type="button"
              onClick={handleBatchImport}
              disabled={importing || !jsonInput.trim()}
            >
              Start import and verify
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
