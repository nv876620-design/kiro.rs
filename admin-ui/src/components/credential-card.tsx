import { useState } from 'react'
import { toast } from 'sonner'
import {
  RefreshCw,
  ChevronUp,
  ChevronDown,
  Wallet,
  Trash2,
  Loader2,
  Check,
  X,
  Pencil,
  RotateCcw,
} from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import {
  credentialTitle,
  formatAmount,
  isPassthroughKind,
  passthroughKindLabel,
  remainingIndicatorClass,
  remainingPercentage,
} from '@/lib/credential'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { CredentialStatusItem, BalanceResponse } from '@/types/api'
import { CredentialDetailDialog } from '@/components/credential-detail-dialog'
import {
  useSetDisabled,
  useSetPriority,
  useSetName,
  useResetFailure,
  useDeleteCredential,
  useForceRefreshToken,
} from '@/hooks/use-credentials'

interface CredentialCardProps {
  credential: CredentialStatusItem
  onViewBalance: (id: number) => void
  selected: boolean
  onToggleSelect: () => void
  balance: BalanceResponse | null
  loadingBalance: boolean
}

function formatLastUsed(lastUsedAt: string | null): string {
  if (!lastUsedAt) return 'Never used'
  const date = new Date(lastUsedAt)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  if (diff < 0) return 'Just now'
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

// Build RPM usage display per credential: only show categories with limits (>0), format like "Opus 2/5"
function formatRpmUsage(rpm: CredentialStatusItem['rpm']): string | null {
  if (!rpm) return null
  const parts: string[] = []
  if (rpm.limitOpus > 0) parts.push(`Opus ${rpm.counts.opus}/${rpm.limitOpus}`)
  if (rpm.limitSonnet > 0) parts.push(`Sonnet ${rpm.counts.sonnet}/${rpm.limitSonnet}`)
  if (rpm.limitHaiku > 0) parts.push(`Haiku ${rpm.counts.haiku}/${rpm.limitHaiku}`)
  if (rpm.limitOther > 0) parts.push(`Other ${rpm.counts.other}/${rpm.limitOther}`)
  return parts.length > 0 ? parts.join(', ') : null
}

// Auth method display name
function authMethodLabel(method: string | null | undefined): string | null {
  if (!method) return null
  switch (method) {
    case 'api_key':
      return 'API Key'
    case 'idc':
      return 'IdC'
    case 'social':
      return 'Social'
    default:
      return method
  }
}

// Credential health status: drives the status dot before title
type Health = 'active' | 'ok' | 'warn' | 'disabled'

function credentialHealth(credential: CredentialStatusItem): Health {
  if (credential.disabled) return 'disabled'
  if (credential.failureCount > 0 || credential.refreshFailureCount > 0) return 'warn'
  if (credential.isCurrent) return 'active'
  return 'ok'
}

const healthDot: Record<Health, { color: string; label: string }> = {
  active: { color: 'bg-primary', label: 'Currently Active' },
  ok: { color: 'bg-success', label: 'Normal' },
  warn: { color: 'bg-warning', label: 'Has Failure Records' },
  disabled: { color: 'bg-muted-foreground/50', label: 'Disabled' },
}

// Meta row: label on left, value on right
function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right font-medium">{children}</span>
    </div>
  )
}

export function CredentialCard({
  credential,
  onViewBalance,
  selected,
  onToggleSelect,
  balance,
  loadingBalance,
}: CredentialCardProps) {
  const [editingPriority, setEditingPriority] = useState(false)
  const [priorityValue, setPriorityValue] = useState(String(credential.priority))
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState(credential.name ?? '')
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showDetailDialog, setShowDetailDialog] = useState(false)

  const setDisabled = useSetDisabled()
  const setPriority = useSetPriority()
  const setName = useSetName()
  const resetFailure = useResetFailure()
  const deleteCredential = useDeleteCredential()
  const forceRefresh = useForceRefreshToken()

  const handleToggleDisabled = () => {
    setDisabled.mutate(
      { id: credential.id, disabled: !credential.disabled },
      {
        onSuccess: (res) => {
          toast.success(res.message)
        },
        onError: (err) => {
          toast.error('Operation failed: ' + (err as Error).message)
        },
      }
    )
  }

  const handlePriorityChange = () => {
    const newPriority = parseInt(priorityValue, 10)
    if (isNaN(newPriority) || newPriority < 0) {
      toast.error('Priority must be a non-negative integer')
      return
    }
    setPriority.mutate(
      { id: credential.id, priority: newPriority },
      {
        onSuccess: (res) => {
          toast.success(res.message)
          setEditingPriority(false)
        },
        onError: (err) => {
          toast.error('Operation failed: ' + (err as Error).message)
        },
      }
    )
  }

  const startEditName = () => {
    setNameValue(credential.name ?? '')
    setEditingName(true)
  }

  const handleNameChange = () => {
    const trimmed = nameValue.trim()
    // If it matches the current value (both empty or identical strings), collapse the editor without sending a request
    if (trimmed === (credential.name ?? '')) {
      setEditingName(false)
      return
    }
    setName.mutate(
      { id: credential.id, name: trimmed === '' ? null : trimmed },
      {
        onSuccess: (res) => {
          toast.success(res.message)
          setEditingName(false)
        },
        onError: (err) => {
          toast.error('Operation failed: ' + (err as Error).message)
        },
      }
    )
  }

  const handleReset = () => {
    resetFailure.mutate(credential.id, {
      onSuccess: (res) => {
        toast.success(res.message)
      },
      onError: (err) => {
        toast.error('Operation failed: ' + (err as Error).message)
      },
    })
  }

  const handleForceRefresh = () => {
    forceRefresh.mutate(credential.id, {
      onSuccess: (res) => {
        toast.success(res.message)
      },
      onError: (err) => {
        toast.error('Refresh failed: ' + (err as Error).message)
      },
    })
  }

  const handleDelete = () => {
    if (!credential.disabled) {
      toast.error('Disable the credential before deleting it')
      setShowDeleteDialog(false)
      return
    }

    deleteCredential.mutate(credential.id, {
      onSuccess: (res) => {
        toast.success(res.message)
        setShowDeleteDialog(false)
      },
      onError: (err) => {
        toast.error('Delete failed: ' + (err as Error).message)
      },
    })
  }

  const health = credentialHealth(credential)
  const dot = healthDot[health]
  const authLabel = authMethodLabel(credential.authMethod)
  const kindLabel = passthroughKindLabel(credential.kind)
  const isPassthrough = isPassthroughKind(credential.kind)
  const rpmUsage = formatRpmUsage(credential.rpm)
  const hasFailure = credential.failureCount > 0 || credential.refreshFailureCount > 0
  const title = credentialTitle(credential)
  // Show #ID in subtitle only when a custom name or email is used as title, avoiding "Credential #3 / #3" duplication
  const showIdInSub = Boolean(credential.name || credential.email)
  const remainingPct = balance ? remainingPercentage(balance) : null

  return (
    <>
      <Card
        className={cn(
          'flex flex-col rounded-xl border-border/70 shadow-sm transition-all hover:border-border hover:shadow-md',
          credential.isCurrent && 'ring-1 ring-primary/40',
          credential.disabled && 'opacity-70'
        )}
      >
        <CardHeader className="gap-0 space-y-0 p-4 pb-3">
          <div className="flex items-center gap-2.5">
            <Checkbox checked={selected} onCheckedChange={onToggleSelect} className="shrink-0" />

            <div className="min-w-0 flex-1">
              <div className="group flex items-center gap-2">
                <span
                  className={cn('h-2 w-2 shrink-0 rounded-full', dot.color)}
                  title={dot.label}
                />
                {editingName ? (
                  <span className="flex min-w-0 flex-1 items-center gap-1">
                    <Input
                      value={nameValue}
                      onChange={(e) => setNameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleNameChange()
                        if (e.key === 'Escape') setEditingName(false)
                      }}
                      placeholder="Display name (empty to clear)"
                      autoFocus
                      className="h-7 min-w-0 flex-1 text-sm"
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 shrink-0"
                      onClick={handleNameChange}
                      disabled={setName.isPending}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 shrink-0"
                      onClick={() => setEditingName(false)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </span>
                ) : (
                  <>
                    <span
                      className="truncate text-sm font-semibold leading-tight"
                      title={title}
                    >
                      {title}
                    </span>
                    <button
                      type="button"
                      className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-primary group-hover:opacity-100"
                      onClick={startEditName}
                      title="Edit display name"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                  </>
                )}
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                {showIdInSub && <span className="font-mono">#{credential.id}</span>}
                {isPassthrough ? (
                  <>
                    {showIdInSub && <span className="text-border">·</span>}
                    <span>{kindLabel}</span>
                    {credential.baseUrl && (
                      <>
                        <span className="text-border">·</span>
                        <span className="truncate">{credential.baseUrl}</span>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    {authLabel && (
                      <>
                        {showIdInSub && <span className="text-border">·</span>}
                        <span>{authLabel}</span>
                      </>
                    )}
                    {credential.endpoint && (
                      <>
                        {(showIdInSub || authLabel) && <span className="text-border">·</span>}
                        <span className="truncate">{credential.endpoint}</span>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>

            <Switch
              checked={!credential.disabled}
              onCheckedChange={handleToggleDisabled}
              disabled={setDisabled.isPending}
              className="shrink-0"
            />
          </div>

          {/* Status badge row (only appears when there's content) */}
          {(credential.isCurrent || credential.disabled || credential.hasProfileArn) && (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {credential.isCurrent && <Badge variant="success">Currently Active</Badge>}
              {credential.disabled && <Badge variant="destructive">Disabled</Badge>}
              {credential.disabled && credential.disabledReason && (
                <Badge variant="outline" className="text-destructive">
                  {credential.disabledReason}
                </Badge>
              )}
              {credential.hasProfileArn && <Badge variant="outline">Profile ARN</Badge>}
            </div>
          )}
        </CardHeader>

        <CardContent className="flex flex-1 flex-col gap-3 p-4 pt-0">
          {/* Balance area: passthrough credentials only expose a balance (no total/percentage), Kiro credentials show the remaining usage percentage */}
          {isPassthrough ? (
            <div className="rounded-lg bg-muted/40 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Wallet className="h-3.5 w-3.5" />
                  <span>Account Balance</span>
                  {!loadingBalance && balance?.subscriptionTitle && (
                    <Badge variant="secondary" className="ml-0.5 px-1.5 py-0 text-[10px]">
                      {balance.subscriptionTitle}
                    </Badge>
                  )}
                </div>
                {loadingBalance ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                ) : balance ? (
                  <span
                    className={cn(
                      'text-lg font-bold leading-none tabular-nums',
                      balance.remaining <= 0 && 'text-destructive'
                    )}
                  >
                    <span className="mr-0.5 text-xs font-normal text-muted-foreground">$</span>
                    {formatAmount(balance.remaining)}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">Unknown</span>
                )}
              </div>
              {!balance && !loadingBalance && (
                <div className="mt-1.5 text-[11px] text-muted-foreground">
                  Click "View Balance" to fetch the account balance
                </div>
              )}
              {balance && !loadingBalance && balance.remaining <= 0 && (
                <div className="mt-1.5 text-[11px] text-destructive">Balance exhausted</div>
              )}
            </div>
          ) : (
            <div className="rounded-lg bg-muted/40 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Wallet className="h-3.5 w-3.5" />
                  <span>Remaining Usage</span>
                  {!loadingBalance && balance?.subscriptionTitle && (
                    <Badge variant="secondary" className="ml-0.5 px-1.5 py-0 text-[10px]">
                      {balance.subscriptionTitle}
                    </Badge>
                  )}
                </div>
                {loadingBalance ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                ) : remainingPct !== null ? (
                  <span className="text-lg font-bold leading-none tabular-nums">
                    {remainingPct.toFixed(0)}
                    <span className="ml-0.5 text-xs font-normal text-muted-foreground">%</span>
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">Unknown</span>
                )}
              </div>
              {balance && !loadingBalance ? (
                <>
                  <Progress
                    value={remainingPct ?? 0}
                    max={100}
                    className="mt-2 h-1.5"
                    indicatorClassName={remainingIndicatorClass(remainingPct ?? 0)}
                  />
                  <div className="mt-1.5 text-right text-[11px] text-muted-foreground tabular-nums">
                    Left {formatAmount(balance.remaining)} / {formatAmount(balance.usageLimit)}
                  </div>
                </>
              ) : (
                !loadingBalance && (
                  <div className="mt-1.5 text-[11px] text-muted-foreground">
                    Click "Query Info" or "View Balance" to fetch usage
                  </div>
                )
              )}
            </div>
          )}

          {/* Meta info: label-value rows */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">Priority</span>
              {editingPriority ? (
                <span className="flex items-center gap-1">
                  <Input
                    type="number"
                    value={priorityValue}
                    onChange={(e) => setPriorityValue(e.target.value)}
                    className="h-7 w-14 text-sm"
                    min="0"
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={handlePriorityChange}
                    disabled={setPriority.isPending}
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => {
                      setEditingPriority(false)
                      setPriorityValue(String(credential.priority))
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </span>
              ) : (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 font-medium hover:text-primary"
                  onClick={() => setEditingPriority(true)}
                  title="Click to edit the priority"
                >
                  {credential.priority}
                  <Pencil className="h-3 w-3 text-muted-foreground" />
                </button>
              )}
            </div>

            <MetaRow label="Success / Failure">
              <span className="text-success">{credential.successCount}</span>
              <span className="mx-1 text-muted-foreground">/</span>
              <span className={hasFailure ? 'text-destructive' : ''}>
                {credential.failureCount}
              </span>
              {credential.refreshFailureCount > 0 && (
                <span className="ml-1 text-xs text-destructive">
                  Refresh {credential.refreshFailureCount}
                </span>
              )}
            </MetaRow>

            <MetaRow label="Last Used">{formatLastUsed(credential.lastUsedAt)}</MetaRow>

            {credential.email && <MetaRow label="Email">{credential.email}</MetaRow>}

            {rpmUsage && <MetaRow label="RPM Usage">{rpmUsage}</MetaRow>}

            {credential.maskedApiKey && (
              <MetaRow label="API Key">
                <span className="font-mono">{credential.maskedApiKey}</span>
              </MetaRow>
            )}

            {credential.hasProxy && (
              <MetaRow label="Proxy">
                <span title={credential.proxyUrl}>{credential.proxyUrl}</span>
              </MetaRow>
            )}
          </div>

          {/* Actions */}
          <div className="mt-auto flex items-center gap-1.5 border-t pt-3">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowDetailDialog(true)}
              title="Edit credential details"
            >
              <Pencil className="h-4 w-4" />
              Edit
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="flex-1"
              onClick={() => onViewBalance(credential.id)}
            >
              <Wallet className="mr-1 h-4 w-4" />
              View Balance
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={handleForceRefresh}
              disabled={
                forceRefresh.isPending ||
                credential.disabled ||
                credential.authMethod === 'api_key' ||
                isPassthrough
              }
              title={
                isPassthrough
                  ? 'Passthrough credentials do not need a token refresh'
                  : credential.authMethod === 'api_key'
                    ? 'API Key credentials do not need a token refresh'
                    : credential.disabled
                      ? 'Disabled credentials cannot refresh the token'
                      : 'Force token refresh'
              }
            >
              <RefreshCw className={cn('h-4 w-4', forceRefresh.isPending && 'animate-spin')} />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={handleReset}
              disabled={resetFailure.isPending || !hasFailure}
              title="Reset failure count"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
            <div className="mx-0.5 h-5 w-px bg-border" />
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              title="Increase priority"
              onClick={() => {
                const newPriority = Math.max(0, credential.priority - 1)
                setPriority.mutate(
                  { id: credential.id, priority: newPriority },
                  {
                    onSuccess: (res) => toast.success(res.message),
                    onError: (err) => toast.error('Operation failed: ' + (err as Error).message),
                  }
                )
              }}
              disabled={setPriority.isPending || credential.priority === 0}
            >
              <ChevronUp className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              title="Decrease priority"
              onClick={() => {
                const newPriority = credential.priority + 1
                setPriority.mutate(
                  { id: credential.id, priority: newPriority },
                  {
                    onSuccess: (res) => toast.success(res.message),
                    onError: (err) => toast.error('Operation failed: ' + (err as Error).message),
                  }
                )
              }}
              disabled={setPriority.isPending}
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setShowDeleteDialog(true)}
              disabled={!credential.disabled}
              title={!credential.disabled ? 'Disable the credential before deleting it' : 'Delete credential'}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Delete confirmation dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Credential Deletion</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete credential #{credential.id}? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
              disabled={deleteCredential.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteCredential.isPending || !credential.disabled}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <CredentialDetailDialog
        credentialId={credential.id}
        open={showDetailDialog}
        onOpenChange={setShowDetailDialog}
      />
    </>
  )
}
