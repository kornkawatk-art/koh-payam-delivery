export function makeLinkToken(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return 'o_' + [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}
