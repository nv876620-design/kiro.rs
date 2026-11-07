import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getCredentials,
  setCredentialDisabled,
  setCredentialPriority,
  setCredentialName,
  resetCredentialFailure,
  forceRefreshToken,
  getCredentialBalance,
  addCredential,
  deleteCredential,
  importCredentials,
  getLoadBalancingMode,
  setLoadBalancingMode,
  getAppConfig,
  getAvailableModels,
  updateAppConfig,
  getMetrics,
  getTimeseries,
  getCredentialDetail,
  updateCredential,
} from '@/api/credentials'
import type { AddCredentialRequest, CredentialExportItem, UpdateCredentialRequest } from '@/types/api'

// Query the credential list
export function useCredentials() {
  return useQuery({
    queryKey: ['credentials'],
    queryFn: getCredentials,
    refetchInterval: 30000, // Refresh every 30 seconds
  })
}

// Query monitoring metrics (real-time polling)
export function useMetrics() {
  return useQuery({
    queryKey: ['metrics'],
    queryFn: getMetrics,
    refetchInterval: 4000, // Refresh every 4 seconds
  })
}

// Query monitoring timeseries (trend + distribution by model/credential)
export function useTimeseries(from: number, to: number, bucket: 'hour' | 'day') {
  return useQuery({
    queryKey: ['timeseries', from, to, bucket],
    queryFn: () => getTimeseries(from, to, bucket),
    refetchInterval: 30000, // Refresh every 30 seconds (historical aggregates don't need high frequency)
  })
}

// Query credential balance
export function useCredentialBalance(id: number | null) {
  return useQuery({
    queryKey: ['credential-balance', id],
    queryFn: () => getCredentialBalance(id!),
    enabled: id !== null,
    retry: false, // Don't retry a failed balance query (avoid hammering a banned account)
  })
}

export function useCredentialDetail(id: number | null, enabled = true) {
  return useQuery({
    queryKey: ['credential-detail', id],
    queryFn: () => getCredentialDetail(id!),
    enabled: enabled && id !== null,
  })
}

export function useUpdateCredential() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, request }: { id: number; request: UpdateCredentialRequest }) =>
      updateCredential(id, request),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['credentials'] })
      queryClient.invalidateQueries({ queryKey: ['credential-detail', variables.id] })
      queryClient.invalidateQueries({ queryKey: ['credential-balance', variables.id] })
    },
  })
}

// Set disabled state
export function useSetDisabled() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, disabled }: { id: number; disabled: boolean }) =>
      setCredentialDisabled(id, disabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credentials'] })
    },
  })
}

// Set priority
export function useSetPriority() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, priority }: { id: number; priority: number }) =>
      setCredentialPriority(id, priority),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credentials'] })
    },
  })
}

// Set display name
export function useSetName() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, name }: { id: number; name: string | null }) =>
      setCredentialName(id, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credentials'] })
    },
  })
}

// Reset the failure counter
export function useResetFailure() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => resetCredentialFailure(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credentials'] })
    },
  })
}

// Force refresh the token
export function useForceRefreshToken() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => forceRefreshToken(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credentials'] })
    },
  })
}

// Add a new credential
export function useAddCredential() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (req: AddCredentialRequest) => addCredential(req),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credentials'] })
    },
  })
}

// Delete a credential
export function useDeleteCredential() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => deleteCredential(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credentials'] })
    },
  })
}

// Batch import credentials (backup restore/migration)
export function useImportCredentials() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (credentials: CredentialExportItem[]) => importCredentials(credentials),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credentials'] })
    },
  })
}

// Get the load balancing mode
export function useLoadBalancingMode() {
  return useQuery({
    queryKey: ['loadBalancingMode'],
    queryFn: getLoadBalancingMode,
  })
}

// Set the load balancing mode
export function useSetLoadBalancingMode() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: setLoadBalancingMode,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loadBalancingMode'] })
    },
  })
}

// Get app config
export function useAppConfig() {
  return useQuery({
    queryKey: ['appConfig'],
    queryFn: getAppConfig,
  })
}

// Get available models from credentials
export function useAvailableModels() {
  return useQuery({
    queryKey: ['availableModels'],
    queryFn: getAvailableModels,
    staleTime: 60000, // Cache for 1 minute
  })
}

// Update app config
export function useUpdateAppConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: updateAppConfig,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appConfig'] })
      queryClient.invalidateQueries({ queryKey: ['availableModels'] })
    },
  })
}
