const key = 'orbit.community.invitation'
type StoragePort = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
export function rememberInvitation(
  storage: StoragePort,
  code: string,
  now = Date.now(),
) {
  if (!/^[A-Za-z0-9][A-Za-z0-9:._/-]{0,199}$/.test(code)) return
  const existing = rememberedInvitation(storage, now)
  // Opening another link never silently replaces an already remembered choice.
  if (!existing)
    storage.setItem(key, JSON.stringify({ code, expires: now + 30 * 86400000 }))
}
export function rememberedInvitation(
  storage: StoragePort,
  now = Date.now(),
): string {
  try {
    const value = JSON.parse(storage.getItem(key) ?? 'null') as {
      code?: unknown
      expires?: unknown
    } | null
    return value &&
      typeof value.code === 'string' &&
      /^[A-Za-z0-9][A-Za-z0-9:._/-]{0,199}$/.test(value.code) &&
      typeof value.expires === 'number' &&
      value.expires > now
      ? value.code
      : ''
  } catch {
    return ''
  }
}
export function clearRememberedInvitation(storage: StoragePort, code: string) {
  if (rememberedInvitation(storage) === code) storage.removeItem(key)
}
