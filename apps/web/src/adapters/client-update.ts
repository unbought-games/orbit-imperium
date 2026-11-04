import {
  createClientUpdate,
  reloadStorageKey,
} from '../client-model/client-update'

export class ClientUpdateRequired extends Error {
  readonly retryAfterMs = 30000
  constructor() {
    super('A different client build is available')
  }
}

export const clientUpdate = createClientUpdate({
  build: import.meta.env.ORBIT_CLIENT_BUILD,
  now: () => Date.now(),
  read: () => sessionStorage.getItem(reloadStorageKey),
  write: (value) => sessionStorage.setItem(reloadStorageKey, value),
  schedule: (callback, delay) => {
    setTimeout(callback, delay)
  },
  reload: () => location.reload(),
})

/** Inspect headers before parsing an API contract that this bundle may not know. */
export function checkClientBuild(response: Response) {
  if (
    response.ok &&
    clientUpdate.observe(response.headers.get('X-Orbit-Client-Build'))
  ) {
    // Logout and renewal already succeeded and carry no contract to decode.
    // Still announce the update, but let callers apply the confirmed result.
    if (response.status === 204) return
    void response.body?.cancel().catch(() => {})
    throw new ClientUpdateRequired()
  }
}
