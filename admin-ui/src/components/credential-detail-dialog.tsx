import { useEffect, useMemo, useState } from 'react'
import { Download, Eye, EyeOff, Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import {
  useCredentialDetail,
  useUpdateCredential,
} from '@/hooks/use-credentials'
import type { CredentialDetail, UpdateCredentialRequest } from '@/types/api'
import { extractErrorMessage } from '@/lib/utils'

interface CredentialDetailDialogProps {
  credentialId: number | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

type FormState = Record<string, string>

type FieldKind = 'text' | 'datetime-local'

interface CredentialField {
  key: keyof CredentialDetail
  label: string
  secret?: boolean
  kind?: FieldKind
}

const fields: CredentialField[] = [
  { key: 'name', label: 'Name' },
  { key: 'authMethod', label: 'Auth Method' },
  { key: 'refreshToken', label: 'Refresh Token', secret: true },
  { key: 'clientId', label: 'Client ID', secret: true },
  { key: 'clientSecret', label: 'Client Secret', secret: true },
  { key: 'kiroApiKey', label: 'Kiro API Key', secret: true },
  { key: 'priority', label: 'Priority' },
  { key: 'profileArn', label: 'Profile ARN' },
  { key: 'region', label: 'Region' },
  { key: 'authRegion', label: 'Auth Region' },
  { key: 'apiRegion', label: 'API Region' },
  { key: 'machineId', label: 'Machine ID' },
  { key: 'email', label: 'Email' },
  { key: 'expiresAt', label: 'Expires At', kind: 'datetime-local' },
  { key: 'subscriptionTitle', label: 'Subscription' },
  { key: 'proxyUrl', label: 'Proxy URL' },
  { key: 'proxyUsername', label: 'Proxy Username' },
  { key: 'proxyPassword', label: 'Proxy Password', secret: true },
  { key: 'endpoint', label: 'Endpoint' },
  { key: 'kind', label: 'Kind' },
  { key: 'baseUrl', label: 'Base URL' },
  { key: 'upstreamApiKey', label: 'Upstream API Key', secret: true },
]

function padTwo(value: number): string {
  return String(value).padStart(2, '0')
}

function toDateTimeLocal(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return [
    date.getFullYear(),
    padTwo(date.getMonth() + 1),
    padTwo(date.getDate()),
  ].join('-') + `T${padTwo(date.getHours())}:${padTwo(date.getMinutes())}`
}

function toRfc3339(value: string): string | undefined {
  if (!value) return undefined
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return undefined
  return date.toISOString()
}

function detailToForm(detail: CredentialDetail): FormState {
  const result: FormState = {}
  for (const field of fields) {
    const value = detail[field.key]
    if (field.kind === 'datetime-local' && value) {
      result[field.key] = toDateTimeLocal(String(value))
    } else {
      result[field.key] = value == null ? '' : String(value)
    }
  }
  result.disabled = detail.disabled ? 'true' : 'false'
  return result
}

function formToRequest(form: FormState): UpdateCredentialRequest {
  const entries: Array<[string, string | boolean | undefined]> = Object.entries(form).map(
    ([key, value]) => {
      if (key === 'disabled') return [key, value === 'true'] as [string, boolean]
      if (key === 'expiresAt') return [key, toRfc3339(value)] as [string, string | undefined]
      return [key, value] as [string, string]
    }
  )
  return Object.fromEntries(entries) as UpdateCredentialRequest
}

function downloadCredential(detail: CredentialDetail, filename: string) {
  const expiresAt = detail.expiresAt ? Date.parse(detail.expiresAt) || 0 : 0
  const idp =
    detail.provider ||
    (detail.authMethod?.toLowerCase() === 'idc'
      ? 'BuilderId'
      : detail.kiroApiKey
        ? 'ApiKey'
        : 'Social')

  // KAM / ZyphrZero compatible single-account export
  const exportCredential = {
    version: '1.8.3',
    exportedAt: Date.now(),
    accounts: [
      {
        id: String(detail.id),
        email: detail.email || detail.name || `credential-${detail.id}`,
        nickname: detail.name || undefined,
        idp,
        machineId: detail.machineId || undefined,
        profileArn: detail.profileArn || undefined,
        credentials: {
          accessToken: detail.accessToken || '',
          csrfToken: '',
          refreshToken: detail.refreshToken || undefined,
          clientId: detail.clientId || undefined,
          clientSecret: detail.clientSecret || undefined,
          region: detail.authRegion || detail.region || undefined,
          authRegion: detail.authRegion || undefined,
          apiRegion: detail.apiRegion || undefined,
          startUrl: detail.startUrl || undefined,
          tokenEndpoint: detail.tokenEndpoint || undefined,
          issuerUrl: detail.issuerUrl || undefined,
          scopes: detail.scopes || undefined,
          expiresAt,
          authMethod: detail.authMethod || undefined,
          provider: detail.provider || undefined,
          profileArn: detail.profileArn || undefined,
          priority: detail.priority,
          disabled: detail.disabled || undefined,
          kiroApiKey: detail.kiroApiKey || undefined,
          endpoint: detail.endpoint || undefined,
          kind: detail.kind || undefined,
          baseUrl: detail.baseUrl || undefined,
          upstreamApiKey: detail.upstreamApiKey || undefined,
          proxyUrl: detail.proxyUrl || undefined,
          proxyUsername: detail.proxyUsername || undefined,
          proxyPassword: detail.proxyPassword || undefined,
          subscriptionTitle: detail.subscriptionTitle || undefined,
        },
        subscription: {
          type: detail.subscriptionTitle || 'Free',
          title: detail.subscriptionTitle || undefined,
        },
        usage: {},
        tags: [],
        status: detail.disabled ? 'disabled' : 'active',
        createdAt: Date.now(),
        lastUsedAt: 0,
      },
    ],
    groups: [],
    tags: [],
  }
  const blob = new Blob([JSON.stringify(exportCredential, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function CredentialDetailDialog({
  credentialId,
  open,
  onOpenChange,
}: CredentialDetailDialogProps) {
  const detailQuery = useCredentialDetail(credentialId, open)
  const update = useUpdateCredential()
  const [form, setForm] = useState<FormState>({})
  const [showSecrets, setShowSecrets] = useState(false)

  useEffect(() => {
    if (detailQuery.data) setForm(detailToForm(detailQuery.data))
  }, [detailQuery.data])

  const title = useMemo(
    () => (credentialId == null ? 'Credential' : `Credential #${credentialId}`),
    [credentialId]
  )

  const handleSave = () => {
    if (credentialId == null) return
    update.mutate(
      { id: credentialId, request: formToRequest(form) },
      {
        onSuccess: (data) => {
          toast.success(data.message)
          onOpenChange(false)
        },
        onError: (error) => toast.error(`Update failed: ${extractErrorMessage(error)}`),
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {detailQuery.isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : detailQuery.error ? (
          <p className="py-6 text-sm text-destructive">
            Failed to load credential: {extractErrorMessage(detailQuery.error)}
          </p>
        ) : (
          <>
            <div className="mb-2 flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              <span>Secrets are loaded only after opening this authenticated dialog.</span>
              <Button type="button" size="sm" variant="ghost" onClick={() => setShowSecrets((value) => !value)}>
                {showSecrets ? <EyeOff className="mr-1 h-4 w-4" /> : <Eye className="mr-1 h-4 w-4" />}
                {showSecrets ? 'Hide secrets' : 'Show secrets'}
              </Button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {fields.map((field) => (
                <label key={String(field.key)} className="space-y-1 text-sm">
                  <span className="font-medium">{field.label}</span>
                  <Input
                    type={field.secret && !showSecrets ? 'password' : 'text'}
                    value={form[field.key] ?? ''}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, [field.key]: event.target.value }))
                    }
                    disabled={update.isPending}
                  />
                </label>
              ))}
            </div>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium">Disabled</span>
              <Checkbox
                checked={form.disabled === 'true'}
                onCheckedChange={(checked) =>
                  setForm((current) => ({ ...current, disabled: checked ? 'true' : 'false' }))
                }
                disabled={update.isPending}
                className="shrink-0"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Leave a secret field unchanged to keep it. Saving an OAuth credential validates it and refreshes its token.
            </p>
          </>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={!detailQuery.data || update.isPending}
            onClick={() => detailQuery.data && downloadCredential(detailQuery.data, `kiro-credential-${credentialId}.json`)}
          >
            <Download className="mr-1 h-4 w-4" />
            Export full JSON
          </Button>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={!detailQuery.data || update.isPending} onClick={handleSave}>
            {update.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
