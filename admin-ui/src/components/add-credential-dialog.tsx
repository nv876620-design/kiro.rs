import { useState } from 'react'
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
import { useAddCredential } from '@/hooks/use-credentials'
import { extractErrorMessage } from '@/lib/utils'

interface AddCredentialDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type AuthMethod = 'social' | 'idc' | 'api_key'
type CredKind = 'kiro' | 'anthropic' | 'openai'

export function AddCredentialDialog({ open, onOpenChange }: AddCredentialDialogProps) {
  const [kind, setKind] = useState<CredKind>('kiro')
  const [refreshToken, setRefreshToken] = useState('')
  const [kiroApiKey, setKiroApiKey] = useState('')
  const [authMethod, setAuthMethod] = useState<AuthMethod>('social')
  const [authRegion, setAuthRegion] = useState('')
  const [apiRegion, setApiRegion] = useState('')
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [priority, setPriority] = useState('0')
  const [machineId, setMachineId] = useState('')
  const [proxyUrl, setProxyUrl] = useState('')
  const [proxyUsername, setProxyUsername] = useState('')
  const [proxyPassword, setProxyPassword] = useState('')
  const [endpoint, setEndpoint] = useState('')
  // Passthrough credential fields
  const [baseUrl, setBaseUrl] = useState('')
  const [upstreamApiKey, setUpstreamApiKey] = useState('')

  const { mutate, isPending } = useAddCredential()

  const resetForm = () => {
    setKind('kiro')
    setRefreshToken('')
    setKiroApiKey('')
    setAuthMethod('social')
    setAuthRegion('')
    setApiRegion('')
    setClientId('')
    setClientSecret('')
    setPriority('0')
    setMachineId('')
    setProxyUrl('')
    setProxyUsername('')
    setProxyPassword('')
    setEndpoint('')
    setBaseUrl('')
    setUpstreamApiKey('')
  }

  const isPassthrough = kind === 'anthropic' || kind === 'openai'
  const isApiKey = authMethod === 'api_key'

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    // Passthrough credential: validate baseUrl + upstreamApiKey, ignore the other Kiro fields
    if (isPassthrough) {
      if (!baseUrl.trim()) {
        toast.error('Please enter a Base URL')
        return
      }
      if (!upstreamApiKey.trim()) {
        toast.error('Please enter an API Key')
        return
      }
      mutate(
        {
          kind,
          baseUrl: baseUrl.trim(),
          upstreamApiKey: upstreamApiKey.trim(),
          priority: parseInt(priority) || 0,
          proxyUrl: proxyUrl.trim() || undefined,
          proxyUsername: proxyUsername.trim() || undefined,
          proxyPassword: proxyPassword.trim() || undefined,
        },
        {
          onSuccess: (data) => {
            toast.success(data.message)
            onOpenChange(false)
            resetForm()
          },
          onError: (error: unknown) => {
            toast.error(`Failed to add: ${extractErrorMessage(error)}`)
          },
        }
      )
      return
    }

    // Validate required fields
    if (isApiKey) {
      if (!kiroApiKey.trim()) {
        toast.error('Please enter the Kiro API Key')
        return
      }
    } else {
      if (!refreshToken.trim()) {
        toast.error('Please enter the Refresh Token')
        return
      }
      // IdC/Builder-ID/IAM requires extra fields
      if (authMethod === 'idc' && (!clientId.trim() || !clientSecret.trim())) {
        toast.error('IdC/Builder-ID/IAM auth requires both Client ID and Client Secret')
        return
      }
    }

    mutate(
      {
        kind: 'kiro',
        authMethod,
        refreshToken: isApiKey ? undefined : refreshToken.trim(),
        kiroApiKey: isApiKey ? kiroApiKey.trim() : undefined,
        authRegion: authRegion.trim() || undefined,
        apiRegion: apiRegion.trim() || undefined,
        clientId: isApiKey ? undefined : clientId.trim() || undefined,
        clientSecret: isApiKey ? undefined : clientSecret.trim() || undefined,
        priority: parseInt(priority) || 0,
        machineId: machineId.trim() || undefined,
        proxyUrl: proxyUrl.trim() || undefined,
        proxyUsername: proxyUsername.trim() || undefined,
        proxyPassword: proxyPassword.trim() || undefined,
        endpoint: endpoint.trim() || undefined,
      },
      {
        onSuccess: (data) => {
          toast.success(data.message)
          onOpenChange(false)
          resetForm()
        },
        onError: (error: unknown) => {
          toast.error(`Failed to add: ${extractErrorMessage(error)}`)
        },
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Add Credential</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1">
          <div className="space-y-4 py-4 overflow-y-auto flex-1 pr-1">
            {/* Credential type */}
            <div className="space-y-2">
              <label htmlFor="kind" className="text-sm font-medium">
                Credential type
              </label>
              <select
                id="kind"
                value={kind}
                onChange={(e) => setKind(e.target.value as CredKind)}
                disabled={isPending}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="kiro">Kiro (default)</option>
                <option value="anthropic">Claude passthrough (Anthropic /v1/messages)</option>
                <option value="openai">Codex passthrough (OpenAI /v1/responses)</option>
              </select>
              {isPassthrough && (
                <p className="text-xs text-muted-foreground">
                  Passthrough credentials are forwarded to the upstream API as-is; they join the same pool as Kiro credentials and fail over per protocol
                </p>
              )}
            </div>

            {/* Passthrough credential fields */}
            {isPassthrough && (
              <>
                <div className="space-y-2">
                  <label htmlFor="baseUrl" className="text-sm font-medium">
                    Base URL <span className="text-red-500">*</span>
                  </label>
                  <Input
                    id="baseUrl"
                    placeholder={
                      kind === 'openai'
                        ? 'e.g. https://api.openai.com'
                        : 'e.g. https://api.anthropic.com'
                    }
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    disabled={isPending}
                  />
                  <p className="text-xs text-muted-foreground">
                    Upstream API base URL; /v1/messages or /v1/responses and /v1/usage are appended automatically
                  </p>
                </div>
                <div className="space-y-2">
                  <label htmlFor="upstreamApiKey" className="text-sm font-medium">
                    API Key <span className="text-red-500">*</span>
                  </label>
                  <Input
                    id="upstreamApiKey"
                    type="password"
                    placeholder="Format: sk-xxxxxxxx"
                    value={upstreamApiKey}
                    onChange={(e) => setUpstreamApiKey(e.target.value)}
                    disabled={isPending}
                  />
                </div>
              </>
            )}

            {/* Auth method (Kiro only) */}
            {!isPassthrough && (
            <div className="space-y-2">
              <label htmlFor="authMethod" className="text-sm font-medium">
                Auth method
              </label>
              <select
                id="authMethod"
                value={authMethod}
                onChange={(e) => setAuthMethod(e.target.value as AuthMethod)}
                disabled={isPending}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="social">Social</option>
                <option value="idc">IdC/Builder-ID/IAM</option>
                <option value="api_key">API Key</option>
              </select>
            </div>
            )}

            {/* Kiro API Key (API Key mode) */}
            {!isPassthrough && isApiKey && (
              <div className="space-y-2">
                <label htmlFor="kiroApiKey" className="text-sm font-medium">
                  Kiro API Key <span className="text-red-500">*</span>
                </label>
                <Input
                  id="kiroApiKey"
                  type="password"
                  placeholder="Format: ksk_xxxxxxxx"
                  value={kiroApiKey}
                  onChange={(e) => setKiroApiKey(e.target.value)}
                  disabled={isPending}
                />
              </div>
            )}

            {/* Refresh Token (OAuth mode) */}
            {!isPassthrough && !isApiKey && (
              <div className="space-y-2">
                <label htmlFor="refreshToken" className="text-sm font-medium">
                  Refresh Token <span className="text-red-500">*</span>
                </label>
                <Input
                  id="refreshToken"
                  type="password"
                  placeholder="Enter the Refresh Token"
                  value={refreshToken}
                  onChange={(e) => setRefreshToken(e.target.value)}
                  disabled={isPending}
                />
              </div>
            )}

            {/* Region config (Kiro only) */}
            {!isPassthrough && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Region config</label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Input
                    id="authRegion"
                    placeholder="Auth Region"
                    value={authRegion}
                    onChange={(e) => setAuthRegion(e.target.value)}
                    disabled={isPending}
                  />
                </div>
                <div>
                  <Input
                    id="apiRegion"
                    placeholder="API Region"
                    value={apiRegion}
                    onChange={(e) => setApiRegion(e.target.value)}
                    disabled={isPending}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Both can be left empty to use the global config. Auth Region is used for token refresh, API Region for API requests
              </p>
            </div>
            )}

            {/* IdC/Builder-ID/IAM extra fields */}
            {!isPassthrough && authMethod === 'idc' && (
              <>
                <div className="space-y-2">
                  <label htmlFor="clientId" className="text-sm font-medium">
                    Client ID <span className="text-red-500">*</span>
                  </label>
                  <Input
                    id="clientId"
                    placeholder="Enter the Client ID"
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    disabled={isPending}
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="clientSecret" className="text-sm font-medium">
                    Client Secret <span className="text-red-500">*</span>
                  </label>
                  <Input
                    id="clientSecret"
                    type="password"
                    placeholder="Enter the Client Secret"
                    value={clientSecret}
                    onChange={(e) => setClientSecret(e.target.value)}
                    disabled={isPending}
                  />
                </div>
              </>
            )}

            {/* Priority */}
            <div className="space-y-2">
              <label htmlFor="priority" className="text-sm font-medium">
                Priority
              </label>
              <Input
                id="priority"
                type="number"
                min="0"
                placeholder="Lower number means higher priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                disabled={isPending}
              />
              <p className="text-xs text-muted-foreground">
                Lower numbers are used first; the default is 0
              </p>
            </div>

            {/* Machine ID (Kiro only) */}
            {!isPassthrough && (
            <div className="space-y-2">
              <label htmlFor="machineId" className="text-sm font-medium">
                Machine ID
              </label>
              <Input
                id="machineId"
                placeholder="Leave empty to use the config value, otherwise derived automatically when the token is refreshed"
                value={machineId}
                onChange={(e) => setMachineId(e.target.value)}
                disabled={isPending}
              />
              <p className="text-xs text-muted-foreground">
                Optional; 64-char hex or UUID
              </p>
            </div>
            )}

            {/* Endpoint (Kiro only) */}
            {!isPassthrough && (
            <div className="space-y-2">
              <label htmlFor="endpoint" className="text-sm font-medium">
                Endpoint
              </label>
              <Input
                id="endpoint"
                placeholder="Leave empty to use the default endpoint (e.g. ide / cli)"
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                disabled={isPending}
              />
              <p className="text-xs text-muted-foreground">
                Optional. Determines which Kiro API this credential uses. Leave empty to use the global defaultEndpoint
              </p>
            </div>
            )}

            {/* Proxy config */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Proxy config</label>
              <Input
                id="proxyUrl"
                placeholder='Proxy URL (leave empty for the global config, "direct" to disable the proxy)'
                value={proxyUrl}
                onChange={(e) => setProxyUrl(e.target.value)}
                disabled={isPending}
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  id="proxyUsername"
                  placeholder="Proxy username"
                  value={proxyUsername}
                  onChange={(e) => setProxyUsername(e.target.value)}
                  disabled={isPending}
                />
                <Input
                  id="proxyPassword"
                  type="password"
                  placeholder="Proxy password"
                  value={proxyPassword}
                  onChange={(e) => setProxyPassword(e.target.value)}
                  disabled={isPending}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Leave empty to use the global proxy. Enter "direct" to explicitly disable it
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Adding...' : 'Add'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
