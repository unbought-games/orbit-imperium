export interface OidcConfig {
  mode: 'oidc' | 'local'
  universes: { universe: string; name: string }[]
  accounts_url?: string
  client_id?: string
}

export interface OidcIdentity {
  username: string
  email_verified: boolean
  expires_at?: number
  supporter_tier?: number
}

export const oidcHttp = {
  async config(signal: AbortSignal): Promise<OidcConfig> {
    const response = await fetch('/api/auth/config', { signal })
    if (!response.ok) throw new Error('Unable to load sign-in options.')
    return response.json()
  },
  async identity(signal?: AbortSignal): Promise<OidcIdentity | null> {
    const response = await fetch('/api/auth/identity', {
      signal,
      cache: 'no-store',
    })
    if (response.status === 401 || response.status === 403) return null
    if (!response.ok) throw new Error('Unable to refresh account identity.')
    return response.json()
  },
  async enroll(universe: string): Promise<void> {
    const session = await fetch('/api/v1/session').then((r) => r.json())
    const result = await fetch('/api/auth/enroll', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': session.csrf,
      },
      body: JSON.stringify({ universe }),
    })
    if (!result.ok)
      throw new Error(
        'This universe is closed, full, or temporarily unavailable. Your account is ready; choose another universe or try later.',
      )
  },
}
