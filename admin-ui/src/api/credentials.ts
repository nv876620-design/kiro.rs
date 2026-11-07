import axios from 'axios'
import { storage } from '@/lib/storage'
import type {
  CredentialsStatusResponse,
  BalanceResponse,
  SuccessResponse,
  SetDisabledRequest,
  SetPriorityRequest,
  SetNameRequest,
  AddCredentialRequest,
  AddCredentialResponse,
  AppConfig,
  UpdateAppConfigRequest,
  MetricsResponse,
  TimeseriesResponse,
  CredentialDetail,
  CredentialExportItem,
  CredentialsExportFile,
  ImportCredentialsResponse,
  UpdateCredentialRequest,
  AvailableModelsResponse,
} from '@/types/api'

// Create the axios instance
const api = axios.create({
  baseURL: '/api/admin',
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor: attach the API Key
api.interceptors.request.use((config) => {
  const apiKey = storage.getApiKey()
  if (apiKey) {
    config.headers['x-api-key'] = apiKey
  }
  return config
})

// Get all credential statuses
export async function getCredentials(): Promise<CredentialsStatusResponse> {
  const { data } = await api.get<CredentialsStatusResponse>('/credentials')
  return data
}

// Get monitoring metrics
export async function getMetrics(): Promise<MetricsResponse> {
  const { data } = await api.get<MetricsResponse>('/metrics')
  return data
}

// Get monitoring timeseries (trend + distribution by model/credential)
export async function getTimeseries(
  from: number,
  to: number,
  bucket: 'hour' | 'day'
): Promise<TimeseriesResponse> {
  const { data } = await api.get<TimeseriesResponse>('/metrics/timeseries', {
    params: { from, to, bucket },
  })
  return data
}

// Set the credential disabled state
export async function setCredentialDisabled(
  id: number,
  disabled: boolean
): Promise<SuccessResponse> {
  const { data } = await api.post<SuccessResponse>(
    `/credentials/${id}/disabled`,
    { disabled } as SetDisabledRequest
  )
  return data
}

// Set credential priority
export async function setCredentialPriority(
  id: number,
  priority: number
): Promise<SuccessResponse> {
  const { data } = await api.post<SuccessResponse>(
    `/credentials/${id}/priority`,
    { priority } as SetPriorityRequest
  )
  return data
}

// Set the credential display name (pass null or an empty string to clear)
export async function setCredentialName(
  id: number,
  name: string | null
): Promise<SuccessResponse> {
  const { data } = await api.post<SuccessResponse>(
    `/credentials/${id}/name`,
    { name } as SetNameRequest
  )
  return data
}

// Reset the failure counter
export async function resetCredentialFailure(
  id: number
): Promise<SuccessResponse> {
  const { data } = await api.post<SuccessResponse>(`/credentials/${id}/reset`)
  return data
}

// Force refresh the token
export async function forceRefreshToken(
  id: number
): Promise<SuccessResponse> {
  const { data } = await api.post<SuccessResponse>(`/credentials/${id}/refresh`)
  return data
}

// Get credential balance
export async function getCredentialBalance(id: number): Promise<BalanceResponse> {
  const { data } = await api.get<BalanceResponse>(`/credentials/${id}/balance`)
  return data
}

export async function getCredentialDetail(id: number): Promise<CredentialDetail> {
  const { data } = await api.get<CredentialDetail>(`/credentials/${id}/detail`)
  return data
}

export async function updateCredential(
  id: number,
  req: UpdateCredentialRequest
): Promise<SuccessResponse> {
  const { data } = await api.put<SuccessResponse>(`/credentials/${id}/detail`, req)
  return data
}

// Add a new credential
export async function addCredential(
  req: AddCredentialRequest
): Promise<AddCredentialResponse> {
  const { data } = await api.post<AddCredentialResponse>('/credentials', req)
  return data
}

// Delete a credential
export async function deleteCredential(id: number): Promise<SuccessResponse> {
  const { data } = await api.delete<SuccessResponse>(`/credentials/${id}`)
  return data
}

// Export all credentials (includes secrets — for backup/migration)
// Default shape is the KAM / ZyphrZero compatible envelope.
export async function exportCredentials(): Promise<CredentialsExportFile> {
  const { data } = await api.get<CredentialsExportFile>('/credentials/export')
  return data
}

// Legacy flat array export (`credentials.json` compatible)
export async function exportCredentialsFlat(): Promise<CredentialExportItem[]> {
  const { data } = await api.get<CredentialExportItem[]>('/credentials/export', {
    params: { format: 'flat' },
  })
  return data
}

// Batch import credentials (backup restore/migration; duplicates are skipped)
export async function importCredentials(
  credentials: CredentialExportItem[]
): Promise<ImportCredentialsResponse> {
  const { data } = await api.post<ImportCredentialsResponse>('/credentials/import', {
    credentials,
  })
  return data
}

// Load balancing mode
export type LoadBalancingMode = 'priority' | 'balanced' | 'round-robin'

// Get the load balancing mode
export async function getLoadBalancingMode(): Promise<{ mode: LoadBalancingMode }> {
  const { data } = await api.get<{ mode: LoadBalancingMode }>('/config/load-balancing')
  return data
}

// Set the load balancing mode
export async function setLoadBalancingMode(mode: LoadBalancingMode): Promise<{ mode: LoadBalancingMode }> {
  const { data } = await api.put<{ mode: LoadBalancingMode }>('/config/load-balancing', { mode })
  return data
}

// Get the app config (page-editable subset)
export async function getAppConfig(): Promise<AppConfig> {
  const { data } = await api.get<AppConfig>('/config/app')
  return data
}

// Get available models from credentials
export async function getAvailableModels(): Promise<AvailableModelsResponse> {
  const { data } = await api.get<AvailableModelsResponse>('/config/available-models')
  return data
}

// Update the app config (written back to the file and applied live)
export async function updateAppConfig(req: UpdateAppConfigRequest): Promise<AppConfig> {
  const { data } = await api.put<AppConfig>('/config/app', req)
  return data
}
