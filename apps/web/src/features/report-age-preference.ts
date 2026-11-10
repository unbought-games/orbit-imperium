import { useState } from 'react'

const key = 'orbit:report-archive-age'
const defaults = { preset: '168', customHours: '24' }
export function readReportAge(storage: Pick<Storage, 'getItem'>) {
  try {
    const value = JSON.parse(storage.getItem(key) ?? 'null')
    if (
      value &&
      ['24', '168', '720', 'custom'].includes(value.preset) &&
      typeof value.customHours === 'string'
    )
      return { preset: value.preset as string, customHours: value.customHours }
  } catch {
    /* Storage can be unavailable in private browsing. */
  }
  return defaults
}

export function useReportAgePreference() {
  const [age, setAge] = useState(() => {
    try {
      return readReportAge(localStorage)
    } catch {
      return defaults
    }
  })
  return [
    age,
    (value: typeof defaults) => {
      setAge(value)
      try {
        localStorage.setItem(key, JSON.stringify(value))
      } catch {
        /* Keep the session edit. */
      }
    },
  ] as const
}
