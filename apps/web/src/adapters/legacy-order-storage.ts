/** Delete retired command persistence without making browser storage a game dependency. */
export function clearLegacyOrderStorage(getStorage: () => Storage) {
  try {
    const storage = getStorage()
    for (const key of Object.keys(storage)) {
      if (/^orbit:(attempts|history|session):/.test(key))
        storage.removeItem(key)
    }
  } catch {
    // Storage may be blocked. Old records are never read or replayed.
  }
}
