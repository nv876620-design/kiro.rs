// Normalize any credential/backup file into the flat objects accepted by
// POST /credentials/import.
//
// Supported shapes:
// - flat array (legacy credentials-backup.json)
// - single credential object
// - KAM / ZyphrZero envelope { version, exportedAt, accounts: [...] }
// - KAM account object { email, nickname, credentials: {...} }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function accountToCredential(account: Record<string, unknown>): Record<string, unknown> {
  if (!isRecord(account.credentials)) {
    return { ...account }
  }

  const merged: Record<string, unknown> = { ...account.credentials, ...account }
  delete merged.credentials

  if (typeof merged.name !== 'string' && typeof merged.nickname === 'string') {
    merged.name = merged.nickname
  }

  // KAM stores the token-refresh region in credentials.region; this repo
  // exposes the same value as authRegion.
  if (typeof merged.authRegion !== 'string' && typeof merged.region === 'string') {
    merged.authRegion = merged.region
  }

  if (merged.disabled === undefined && typeof merged.status === 'string') {
    merged.disabled = merged.status.toLowerCase() === 'disabled'
  }

  return merged
}

export function normalizeCredentialImportItems(parsed: unknown): Record<string, unknown>[] {
  let rawItems: unknown[]

  if (isRecord(parsed) && Array.isArray(parsed.accounts)) {
    rawItems = parsed.accounts
  } else if (Array.isArray(parsed)) {
    rawItems = parsed
  } else if (isRecord(parsed)) {
    rawItems = [parsed]
  } else {
    rawItems = []
  }

  return rawItems.filter(isRecord).map(accountToCredential)
}
