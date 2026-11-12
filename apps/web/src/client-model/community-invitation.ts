const key = 'orbit.community.invitation'
type StoragePort = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
export type PendingInvitation = {
  code: string
  expires: number
  account?: string
  request_id?: string
  retry_at?: number
}

function readInvitation(
  storage: StoragePort,
  now: number,
): PendingInvitation | undefined {
  try {
    const value = JSON.parse(
      storage.getItem(key) ?? 'null',
    ) as PendingInvitation | null
    if (
      value &&
      typeof value.code === 'string' &&
      /^[A-Za-z0-9][A-Za-z0-9:._/-]{0,199}$/.test(value.code) &&
      typeof value.expires === 'number' &&
      value.expires > now
    )
      return value
  } catch {
    /* Optional browser storage. */
  }
}

/** Persist identity before dispatch; retries and document navigation reuse it. */
export function pendingInvitation(
  storage: StoragePort,
  account: string,
  newId: () => string,
  now = Date.now(),
): PendingInvitation | undefined {
  const value = readInvitation(storage, now)
  if (!value || (value.account && value.account !== account)) return
  const pending = { ...value, account, request_id: value.request_id ?? newId() }
  storage.setItem(key, JSON.stringify(pending))
  return pending
}
export function deferInvitation(
  storage: StoragePort,
  pending: PendingInvitation,
  retryAt: number,
  now = Date.now(),
) {
  const current = readInvitation(storage, now)
  if (current?.request_id === pending.request_id)
    storage.setItem(key, JSON.stringify({ ...current, retry_at: retryAt }))
}
export function rememberInvitation(
  storage: StoragePort,
  code: string,
  now = Date.now(),
) {
  if (!/^[A-Za-z0-9][A-Za-z0-9:._/-]{0,199}$/.test(code)) return
  const existing = readInvitation(storage, now)
  // Before identity is known, follow the current entry link. Once dispatched,
  // retain its stable account-bound operation through ambiguous failures.
  if (!existing?.account)
    storage.setItem(key, JSON.stringify({ code, expires: now + 30 * 86400000 }))
}
export function rememberedInvitation(
  storage: StoragePort,
  now = Date.now(),
): string {
  return readInvitation(storage, now)?.code ?? ''
}
export function clearRememberedInvitation(
  storage: StoragePort,
  code: string,
  now = Date.now(),
) {
  if (rememberedInvitation(storage, now) === code) storage.removeItem(key)
}
