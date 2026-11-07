import { useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { CheckCircle2, XCircle, Loader2, Upload } from 'lucide-react'
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
import { isDesktop, scanSsoCredentials } from '@/lib/desktop'

interface AwsSsoImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

// OIDC client registration file (db6...json): clientId + clientSecret
interface ClientRegistration {
  clientId: string
  clientSecret: string
}

// Auth token file (kiro-auth-token.json): refreshToken + region, etc.
interface AuthToken {
  refreshToken: string
  region?: string
  authMethod?: string
  provider?: string
}

type Status = 'idle' | 'verifying' | 'verified' | 'duplicate' | 'failed'

interface ImportResult {
  status: Status
  error?: string
  usage?: string
  email?: string
}

// Parse the OIDC client registration JSON
function parseClientJson(raw: string): ClientRegistration {
  const parsed = JSON.parse(raw)
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Client JSON must be an object')
  }
  const clientId = typeof parsed.clientId === 'string' ? parsed.clientId.trim() : ''
  const clientSecret = typeof parsed.clientSecret === 'string' ? parsed.clientSecret.trim() : ''
  if (!clientId || !clientSecret) {
    throw new Error('Client JSON is missing clientId or clientSecret')
  }
  return { clientId, clientSecret }
}

// Parse the auth token JSON
function parseTokenJson(raw: string): AuthToken {
  const parsed = JSON.parse(raw)
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Token JSON must be an object')
  }
  const refreshToken = typeof parsed.refreshToken === 'string' ? parsed.refreshToken.trim() : ''
  if (!refreshToken) {
    throw new Error('Token JSON is missing refreshToken')
  }
  return {
    refreshToken,
    region: typeof parsed.region === 'string' ? parsed.region.trim() : undefined,
    authMethod: typeof parsed.authMethod === 'string' ? parsed.authMethod : undefined,
    provider: typeof parsed.provider === 'string' ? parsed.provider : undefined,
  }
}

// Display path of the SSO cache directory for the current platform (hint text only)
function ssoCacheDisplayPath(): string {
  const ua = navigator.userAgent
  if (/Windows/i.test(ua)) return 'C:\\Users\\{user}\\.aws\\sso\\cache'
  return '~/.aws/sso/cache'
}

export function AwsSsoImportDialog({ open, onOpenChange }: AwsSsoImportDialogProps) {
  const [clientJson, setClientJson] = useState('')
  const [tokenJson, setTokenJson] = useState('')
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [scanning, setScanning] = useState(false)
  const [scanMsg, setScanMsg] = useState('')

  const clientFileRef = useRef<HTMLInputElement>(null)
  const tokenFileRef = useRef<HTMLInputElement>(null)

  const { data: existingCredentials } = useCredentials()
  const { mutateAsync: addCredential } = useAddCredential()
  const { mutateAsync: deleteCredential } = useDeleteCredential()

  const resetForm = () => {
    setClientJson('')
    setTokenJson('')
    setResult(null)
  }

  const handleFile = (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: (value: string) => void
  ) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setter(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => toast.error('Failed to read the file')
    reader.readAsText(file)
    // Allow selecting the same file again
    e.target.value = ''
  }

  // Parse preview
  const { client, token, parseError } = useMemo(() => {
    if (!clientJson.trim() || !tokenJson.trim()) {
      return { client: null, token: null, parseError: '' }
    }
    try {
      return {
        client: parseClientJson(clientJson),
        token: parseTokenJson(tokenJson),
        parseError: '',
      }
    } catch (e) {
      return { client: null, token: null, parseError: extractErrorMessage(e) }
    }
  }, [clientJson, tokenJson])

  const rollbackCredential = async (id: number): Promise<void> => {
    try {
      await setCredentialDisabled(id, true)
      await deleteCredential(id)
    } catch (error) {
      toast.warning(`Rollback failed; disable and delete credential #${id} manually: ${extractErrorMessage(error)}`)
    }
  }

  // Import and verify a single IdC credential. Returns a result kind without touching the UI (shared by the manual and auto-scan paths).
  type ImportOneResult =
    | { kind: 'duplicate'; email?: string }
    | { kind: 'verified'; email?: string; usage?: string }
    | { kind: 'failed'; error: string }
  const importOne = async (params: {
    clientId: string
    clientSecret: string
    refreshToken: string
    region?: string
  }): Promise<ImportOneResult> => {
    // Deduplicate
    const tokenHash = await sha256Hex(params.refreshToken)
    const existing = existingCredentials?.credentials.find(c => c.refreshTokenHash === tokenHash)
    if (existing) {
      return { kind: 'duplicate', email: existing.email }
    }
    let addedCredId: number | null = null
    try {
      const addedCred = await addCredential({
        refreshToken: params.refreshToken,
        authMethod: 'idc',
        clientId: params.clientId,
        clientSecret: params.clientSecret,
        authRegion: params.region || undefined,
      })
      addedCredId = addedCred.credentialId
      let usage: string | undefined
      try {
        await new Promise(resolve => setTimeout(resolve, 1000))
        const balance = await getCredentialBalance(addedCred.credentialId)
        usage = `${balance.currentUsage}/${balance.usageLimit}`
      } catch {
        // IdC does not support usage queries; skip
      }
      return { kind: 'verified', email: addedCred.email, usage }
    } catch (error) {
      if (addedCredId) {
        await rollbackCredential(addedCredId)
      }
      return { kind: 'failed', error: extractErrorMessage(error) }
    }
  }

  const handleImport = async () => {
    let parsedClient: ClientRegistration
    let parsedToken: AuthToken
    try {
      parsedClient = parseClientJson(clientJson)
      parsedToken = parseTokenJson(tokenJson)
    } catch (error) {
      toast.error('Invalid JSON: ' + extractErrorMessage(error))
      return
    }

    setImporting(true)
    setResult({ status: 'verifying' })
    const r = await importOne({
      clientId: parsedClient.clientId,
      clientSecret: parsedClient.clientSecret,
      refreshToken: parsedToken.refreshToken,
      region: parsedToken.region,
    })
    if (r.kind === 'duplicate') {
      setResult({ status: 'duplicate', error: 'This credential already exists', email: r.email })
      toast.info('This credential already exists')
    } else if (r.kind === 'verified') {
      setResult({ status: 'verified', email: r.email, usage: r.usage })
      toast.success('AWS SSO credential imported and verified')
    } else {
      setResult({ status: 'failed', error: r.error })
      toast.error('Import failed: ' + r.error)
    }
    setImporting(false)
  }

  // One-click import: scan the local AWS SSO cache and import + verify each entry (desktop only)
  const handleScanImport = async () => {
    setScanning(true)
    setScanMsg('Scanning the local AWS SSO cache…')
    try {
      const candidates = await scanSsoCredentials()
      if (candidates.length === 0) {
        setScanMsg(`No importable credentials found in ${ssoCacheDisplayPath()} on this machine`)
        toast.info('No importable credentials were found')
        return
      }
      let ok = 0
      let dup = 0
      let fail = 0
      for (let i = 0; i < candidates.length; i++) {
        const c = candidates[i]
        setScanMsg(`Importing ${i + 1}/${candidates.length} (${c.sourceFile})…`)
        const r = await importOne({
          clientId: c.clientId,
          clientSecret: c.clientSecret,
          refreshToken: c.refreshToken,
          region: c.region ?? undefined,
        })
        if (r.kind === 'verified') ok++
        else if (r.kind === 'duplicate') dup++
        else fail++
      }
      setScanMsg(`Done: ${ok} added, ${dup} already present, ${fail} failed`)
      if (ok > 0) toast.success(`One-click import finished: ${ok} credentials added`)
      else if (dup > 0 && fail === 0) toast.info('All scanned credentials already exist')
      else if (fail > 0) toast.error(`${fail} credentials failed to import`)
    } catch (e) {
      const msg = extractErrorMessage(e)
      setScanMsg(`Scan failed: ${msg}`)
      toast.error('Scan failed: ' + msg)
    } finally {
      setScanning(false)
    }
  }

  const placeholderClient = '{\n  "clientId": "...",\n  "clientSecret": "..."\n}'
  const placeholderToken =
    '{\n  "refreshToken": "...",\n  "authMethod": "IdC",\n  "region": "us-east-1"\n}'

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
          <DialogTitle>AWS SSO Import (auto-verify)</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-4">
          {/* One-click import (desktop only: auto-scan the local AWS SSO cache) */}
          {isDesktop() && (
            <div className="rounded-md border bg-muted/30 px-3 py-3 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">One-click import (auto-scan)</div>
                  <div className="text-xs text-muted-foreground">
                    Automatically reads the local <code className="font-mono">{ssoCacheDisplayPath()}</code>{' '}
                    and imports + verifies it, no manual paste needed
                  </div>
                </div>
                <Button onClick={handleScanImport} disabled={scanning || importing}>
                  {scanning ? (
                    <>
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                      Scanning and importing
                    </>
                  ) : (
                    'One-click import'
                  )}
                </Button>
              </div>
              {scanMsg && <div className="text-xs text-muted-foreground">{scanMsg}</div>}
            </div>
          )}

          <p className="text-sm text-muted-foreground">
            AWS IAM Identity Center (IdC/SSO) credentials consist of two JSON files: a client
            registration file (with clientId / clientSecret) and an auth token file (with refreshToken / region).
            Paste or upload each of them separately.
          </p>

          <div className="rounded-md border border-dashed bg-muted/40 px-3 py-2 text-xs text-muted-foreground space-y-1">
            <div className="font-medium text-foreground">File paths (inside the SSO cache directory)</div>
            <div>
              macOS: <code className="font-mono">/Users/{'{user}'}/.aws/sso/cache/</code>
            </div>
            <div>
              Windows: <code className="font-mono">C:\Users\{'{user}'}\.aws\sso\cache\</code>
            </div>
            <div>
              Auth token file: <code className="font-mono">kiro-auth-token.json</code>
            </div>
            <div>
              Client registration file: <code className="font-mono">{'<machine ID (32 hex chars)>'}.json</code>
            </div>
          </div>

          {/* Client registration file */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">
                Client registration JSON <span className="text-red-500">*</span>
                <span className="text-xs text-muted-foreground ml-1">(clientId / clientSecret, file name <code className="font-mono">{'<machine ID, 32 chars>'}.json</code>)</span>
              </label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => clientFileRef.current?.click()}
                disabled={importing}
              >
                <Upload className="h-4 w-4 mr-2" />
                Choose File
              </Button>
              <input
                ref={clientFileRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={(e) => handleFile(e, setClientJson)}
              />
            </div>
            <textarea
              placeholder={placeholderClient}
              value={clientJson}
              onChange={(e) => setClientJson(e.target.value)}
              disabled={importing}
              className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono"
            />
          </div>

          {/* Auth token file */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">
                Auth token JSON <span className="text-red-500">*</span>
                <span className="text-xs text-muted-foreground ml-1">(refreshToken / region, file name <code className="font-mono">kiro-auth-token.json</code>)</span>
              </label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => tokenFileRef.current?.click()}
                disabled={importing}
              >
                <Upload className="h-4 w-4 mr-2" />
                Choose File
              </Button>
              <input
                ref={tokenFileRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={(e) => handleFile(e, setTokenJson)}
              />
            </div>
            <textarea
              placeholder={placeholderToken}
              value={tokenJson}
              onChange={(e) => setTokenJson(e.target.value)}
              disabled={importing}
              className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono"
            />
          </div>

          {/* Parse preview / errors */}
          {parseError && (
            <div className="text-sm text-red-600 dark:text-red-400">Parse failed: {parseError}</div>
          )}
          {client && token && !result && (
            <div className="text-sm text-muted-foreground space-y-1">
              <div>✓ IdC credential recognized</div>
              <div className="text-xs">Region: {token.region || '(using the global config)'}</div>
            </div>
          )}

          {/* Import result */}
          {result && (
            <div className="border rounded-md p-3">
              <div className="flex items-start gap-3">
                {result.status === 'verifying' && (
                  <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                )}
                {result.status === 'verified' && (
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                )}
                {(result.status === 'failed' || result.status === 'duplicate') && (
                  <XCircle className="w-5 h-5 text-red-500" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">
                    {result.status === 'verifying' && 'Verifying...'}
                    {result.status === 'verified' && (result.email || 'Verified')}
                    {result.status === 'duplicate' && 'Duplicate credential'}
                    {result.status === 'failed' && 'Verification failed'}
                  </div>
                  {result.usage && (
                    <div className="text-xs text-muted-foreground mt-1">Usage: {result.usage}</div>
                  )}
                  {result.error && (
                    <div className="text-xs text-red-600 dark:text-red-400 mt-1">{result.error}</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => { onOpenChange(false); resetForm() }}
            disabled={importing}
          >
            {importing ? 'Importing...' : result?.status === 'verified' ? 'Close' : 'Cancel'}
          </Button>
          {result?.status !== 'verified' && (
            <Button
              type="button"
              onClick={handleImport}
              disabled={importing || !client || !token || !!parseError}
            >
              Start import and verify
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
