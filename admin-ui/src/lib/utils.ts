import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Parse backend error responses and extract user-friendly error info
 */
export interface ParsedError {
  /** Short error title */
  title: string
  /** Detailed error description */
  detail?: string
  /** Error type */
  type?: string
}

/**
 * Extract an error message from an error object
 * Supports Axios errors and plain Error objects
 */
export function extractErrorMessage(error: unknown): string {
  const parsed = parseError(error)
  return parsed.title
}

/**
 * Parse an error and return structured error info
 */
export function parseError(error: unknown): ParsedError {
  if (!error || typeof error !== 'object') {
    return { title: 'Unknown error' }
  }

  const axiosError = error as Record<string, unknown>
  const response = axiosError.response as Record<string, unknown> | undefined
  const data = response?.data as Record<string, unknown> | undefined
  const errorObj = data?.error as Record<string, unknown> | undefined

  // Try to extract info from the backend error response
  if (errorObj && typeof errorObj.message === 'string') {
    const message = errorObj.message
    const type = typeof errorObj.type === 'string' ? errorObj.type : undefined

    // Parse nested error message (e.g. upstream service error: insufficient permission: 403 {...})
    const parsed = parseNestedErrorMessage(message)

    return {
      title: parsed.title,
      detail: parsed.detail,
      type,
    }
  }

  // Fall back to Error.message
  if ('message' in axiosError && typeof axiosError.message === 'string') {
    return { title: axiosError.message }
  }

  return { title: 'Unknown error' }
}

/**
 * Parse a nested error message
 * e.g. "upstream service error: insufficient permission to get usage quota: 403 Forbidden {...}"
 */
function parseNestedErrorMessage(message: string): { title: string; detail?: string } {
  // Try to extract the HTTP status code (e.g. 403, 502)
  const statusMatch = message.match(/(\d{3})\s+\w+/)
  const statusCode = statusMatch ? statusMatch[1] : null

  // Try to extract the "message" field from the JSON body
  const jsonMatch = message.match(/\{[^{}]*"message"\s*:\s*"([^"]+)"[^{}]*\}/)
  if (jsonMatch) {
    const innerMessage = jsonMatch[1]
    // Extract the main error reason (strip the prefix)
    const parts = message.split(':').map(s => s.trim())
    const mainReason = parts.length > 1 ? parts[1].split(':')[0] : parts[0]

    // Include the status code in the title
    const title = statusCode
      ? `${mainReason || 'Service error'} (${statusCode})`
      : (mainReason || 'Service error')

    return {
      title,
      detail: innerMessage,
    }
  }

  // Try splitting on colons to extract the main info
  const colonParts = message.split(':')
  if (colonParts.length >= 2) {
    const mainPart = colonParts[1].trim().split(':')[0].trim()
    const title = statusCode ? `${mainPart} (${statusCode})` : mainPart

    return {
      title,
      detail: colonParts.slice(2).join(':').trim() || undefined,
    }
  }

  return { title: message }
}




/**
 * Compute the SHA-256 hash of a string (hex)
 *
 * Prefers the Web Crypto API (crypto.subtle) and automatically falls back to a
 * pure-JS implementation in non-secure contexts (HTTP + non-localhost), which
 * solves crypto.subtle being unavailable in Docker deployments.
 */
export async function sha256Hex(value: string): Promise<string> {
  const encoded = new TextEncoder().encode(value)

  // Use the native Web Crypto API in secure contexts (better performance)
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', encoded)
    const bytes = new Uint8Array(digest)
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
  }

  // Non-secure context fallback: pure-JS SHA-256 implementation
  return sha256Pure(encoded)
}

/**
 * Pure-JS SHA-256 implementation (no external dependencies)
 * Only used when crypto.subtle is unavailable
 */
function sha256Pure(data: Uint8Array): string {
  // SHA-256 constants: fractional parts of the cube roots of the first 64 primes
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ])

  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n))

  // Pre-processing: pad the message
  const bitLen = data.length * 8
  // message + 1 byte 0x80 + padding + 8-byte length, total aligned to 64 bytes
  const padLen = (((data.length + 9 + 63) >>> 6) << 6)
  const buf = new Uint8Array(padLen)
  buf.set(data)
  buf[data.length] = 0x80
  // Write the 64-bit big-endian length (only the low 32 bits; the high 32 bits are always 0 in JS)
  const view = new DataView(buf.buffer)
  view.setUint32(padLen - 4, bitLen, false)

  // Initial hash values
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19

  const w = new Uint32Array(64)

  for (let offset = 0; offset < padLen; offset += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(offset + i * 4, false)
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3)
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10)
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0
    }

    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7

    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)
      const ch = (e & f) ^ (~e & g)
      const temp1 = (h + S1 + ch + K[i] + w[i]) | 0
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const temp2 = (S0 + maj) | 0

      h = g; g = f; f = e; e = (d + temp1) | 0
      d = c; c = b; b = a; a = (temp1 + temp2) | 0
    }

    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0
    h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map(v => (v >>> 0).toString(16).padStart(8, '0'))
    .join('')
}
