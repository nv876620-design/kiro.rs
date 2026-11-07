// Credential status response
export interface CredentialsStatusResponse {
  total: number
  available: number
  currentId: number
  credentials: CredentialStatusItem[]
}

// One exported credential (full object including secrets, same shape as
// credentials.json entries — can be fed back to the import endpoint)
export type CredentialExportItem = Record<string, unknown>

// KAM / ZyphrZero compatible export account
export interface CredentialExportAccount {
  id: string
  email: string
  nickname?: string
  idp: string
  machineId?: string
  profileArn?: string
  credentials: Record<string, unknown>
  subscription?: unknown
  usage?: unknown
  tags?: string[]
  status?: string
  createdAt?: number
  lastUsedAt?: number
}

// KAM / ZyphrZero compatible export envelope
export interface CredentialsExportFile {
  version: string
  exportedAt: number
  accounts: CredentialExportAccount[]
  groups: unknown[]
  tags: unknown[]
}

// Batch import (backup restore / migration)
export interface ImportCredentialsRequest {
  credentials: CredentialExportItem[]
}

export interface ImportFailedItem {
  index: number
  error: string
}

export interface ImportCredentialsResponse {
  success: boolean
  added: number
  duplicates: number
  failed: ImportFailedItem[]
  credentialIds: number[]
}

// Per-credential current usage of the 60-second window for each model class
export interface RpmWindowCounts {
  opus: number
  sonnet: number
  haiku: number
  other: number
}

// Per-credential real-time RPM status: window usage + effective limit (0 = unlimited)
export interface RpmStatus {
  counts: RpmWindowCounts
  limitOpus: number
  limitSonnet: number
  limitHaiku: number
  limitOther: number
}

// Single credential status
export interface CredentialStatusItem {
  id: number
  priority: number
  disabled: boolean
  failureCount: number
  isCurrent: boolean
  expiresAt: string | null
  authMethod: string | null
  hasProfileArn: boolean
  email?: string
  /** Custom display name (takes precedence over email when shown) */
  name?: string
  refreshTokenHash?: string
  apiKeyHash?: string
  maskedApiKey?: string
  successCount: number
  lastUsedAt: string | null
  hasProxy: boolean
  proxyUrl?: string
  refreshFailureCount: number
  disabledReason?: string
  endpoint: string
  /** Credential type: kiro (default) / anthropic / openai (passthrough) */
  kind?: string
  /** Passthrough upstream base URL (passthrough credentials only) */
  baseUrl?: string
  rpm: RpmStatus
  // Locally cached balance returned by the backend (only when not expired), so the page can show it after a refresh without a manual query
  cachedBalance?: BalanceResponse
}

export interface CredentialDetail {
  id: number
  name?: string | null
  accessToken?: string | null
  refreshToken?: string | null
  profileArn?: string | null
  expiresAt?: string | null
  authMethod?: string | null
  clientId?: string | null
  clientSecret?: string | null
  provider?: string | null
  startUrl?: string | null
  tokenEndpoint?: string | null
  issuerUrl?: string | null
  scopes?: string | null
  priority: number
  region?: string | null
  authRegion?: string | null
  apiRegion?: string | null
  machineId?: string | null
  email?: string | null
  subscriptionTitle?: string | null
  proxyUrl?: string | null
  proxyUsername?: string | null
  proxyPassword?: string | null
  kiroApiKey?: string | null
  endpoint?: string | null
  kind?: string | null
  baseUrl?: string | null
  upstreamApiKey?: string | null
  disabled: boolean
}

export interface UpdateCredentialRequest {
  name?: string
  refreshToken?: string
  authMethod?: string
  clientId?: string
  clientSecret?: string
  provider?: string
  startUrl?: string
  tokenEndpoint?: string
  issuerUrl?: string
  scopes?: string
  priority?: number
  region?: string
  authRegion?: string
  apiRegion?: string
  machineId?: string
  email?: string
  proxyUrl?: string
  proxyUsername?: string
  proxyPassword?: string
  kiroApiKey?: string
  endpoint?: string
  kind?: string
  baseUrl?: string
  upstreamApiKey?: string
  profileArn?: string
  expiresAt?: string
  subscriptionTitle?: string
  disabled?: boolean
}

// Statistics for a single model (cumulative calls/tokens + real-time RPM)
export interface ModelStat {
  model: string
  requests: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
  credits: number
  todayRequests: number
  todayInputTokens: number
  todayOutputTokens: number
  todayTotalTokens: number
  todayCredits: number
  rpm: number
}

// Metrics response (process-level counter snapshot + credential pool overview + per-model stats)
export interface MetricsResponse {
  requestsSuccess: number
  requestsError: number
  localRpmRejected: number
  streamDecodeFailures: number
  upstreamRateLimited: number
  streamInterrupted: number
  streamRestarted: number
  uptimeSeconds: number
  credentialsAvailable: number
  credentialsTotal: number
  currentId: number
  models: ModelStat[]
}

// Monitoring timeseries: single time bucket
export interface TimeBucket {
  bucket: number
  requests: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  credits: number
}

// Monitoring timeseries: range aggregate for one dimension (model / credential)
export interface DimBucket {
  key: string
  requests: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  credits: number
}

// Monitoring timeseries response
export interface TimeseriesResponse {
  from: number
  to: number
  bucket: 'hour' | 'day'
  series: TimeBucket[]
  byModel: DimBucket[]
  byCredential: DimBucket[]
}

// Balance response
export interface BalanceResponse {
  id: number
  subscriptionTitle: string | null
  currentUsage: number
  usageLimit: number
  remaining: number
  usagePercentage: number
  nextResetAt: number | null
  available: boolean
}

// Available models response
export interface AvailableModelsResponse {
  anthropicModels: string[]
  openaiModels: string[]
}

// Success response
export interface SuccessResponse {
  success: boolean
  message: string
}

// Error response
export interface AdminErrorResponse {
  error: {
    type: string
    message: string
  }
}

// Request types
export interface SetDisabledRequest {
  disabled: boolean
}

export interface SetPriorityRequest {
  priority: number
}

export interface SetNameRequest {
  name: string | null
}

// Add credential request
export interface AddCredentialRequest {
  name?: string
  refreshToken?: string
  accessToken?: string
  profileArn?: string
  expiresAt?: string
  authMethod?: 'social' | 'idc' | 'api_key'
  clientId?: string
  clientSecret?: string
  provider?: string
  startUrl?: string
  tokenEndpoint?: string
  issuerUrl?: string
  scopes?: string
  disabled?: boolean
  priority?: number
  region?: string
  authRegion?: string
  apiRegion?: string
  machineId?: string
  email?: string
  proxyUrl?: string
  proxyUsername?: string
  proxyPassword?: string
  kiroApiKey?: string
  endpoint?: string
  /** Credential type: kiro (default) / anthropic / openai (passthrough) */
  kind?: 'kiro' | 'anthropic' | 'openai'
  /** Passthrough upstream base URL (required for passthrough credentials) */
  baseUrl?: string
  /** Passthrough upstream API Key (required for passthrough credentials, format sk-xxx) */
  upstreamApiKey?: string
}

// Add credential response
export interface AddCredentialResponse {
  success: boolean
  message: string
  credentialId: number
  email?: string
}

// Model definition (maps to backend ModelDef camelCase)
export interface ModelDef {
  family: string
  version?: string | null
  kiroId: string
  displayId: string
  displayName: string
  created: number
  maxTokens: number
  contextWindow: number
}

// Write/Edit chunked-write policy
// triggerLines: how large before chunking is needed; chunkLines: max lines per chunk (aligned with Kiro's official WRITE_LIMIT)
export interface ChunkedWritePolicy {
  enabled: boolean
  triggerLines: number
  chunkLines: number
}

// Current values of the app config (page-editable subset)
export interface AppConfig {
  apiKey: string
  adminApiKey: string
  credentialRpm: number
  credentialRpmOpus?: number | null
  credentialRpmSonnet?: number | null
  credentialRpmHaiku?: number | null
  credentialRpmMaxWaitMs: number
  kiroVersion: string
  machineId?: string | null
  systemVersion: string
  nodeVersion: string
  streamingSdkVersion: string
  models: ModelDef[]
  modelAliases: Record<string, string>
  chunkedWritePolicy: ChunkedWritePolicy
  codexTruncationCorrection: boolean
  /** Auto re-enable credentials disabled for monthly quota once reset passes (default false) */
  quotaResetRecoveryEnabled: boolean
  /** Global proxy URL (all credentials use it by default) */
  proxyUrl?: string | null
  /** Global proxy auth username */
  proxyUsername?: string | null
  /** Whether a password is set for the global proxy (plaintext is never returned) */
  proxyPasswordSet: boolean
}

// Update app config request (full replacement of the editable subset)
export interface UpdateAppConfigRequest {
  apiKey: string
  adminApiKey?: string
  credentialRpm: number
  credentialRpmOpus?: number | null
  credentialRpmSonnet?: number | null
  credentialRpmHaiku?: number | null
  credentialRpmMaxWaitMs: number
  kiroVersion: string
  machineId?: string | null
  systemVersion: string
  nodeVersion: string
  streamingSdkVersion: string
  models: ModelDef[]
  modelAliases: Record<string, string>
  chunkedWritePolicy: ChunkedWritePolicy
  codexTruncationCorrection?: boolean
  quotaResetRecoveryEnabled?: boolean
  /** Global proxy URL; empty string clears it, omitted leaves it unchanged. Takes effect after restart */
  proxyUrl?: string
  /** Global proxy auth username; empty string clears it, omitted leaves it unchanged */
  proxyUsername?: string
  /** Global proxy auth password; empty string clears it, omitted keeps the current value */
  proxyPassword?: string
}

// AWS SSO（IdC）凭据导出文件中的单条凭据（可直接回导）
export interface SsoExportItem {
  refreshToken: string
  clientId: string
  clientSecret: string
  region: string
  apiRegion?: string
  email?: string
  name?: string
}

// AWS SSO 凭据导出文件（即导出接口响应）
export interface SsoExportFile {
  type: 'kiro-rs-aws-sso-credentials'
  version: number
  exportedAt: string
  /** 被跳过的凭据数（非 IdC 或字段不全） */
  skipped: number
  credentials: SsoExportItem[]
}
