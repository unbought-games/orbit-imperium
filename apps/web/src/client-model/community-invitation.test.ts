import { expect, it } from 'vitest'
import {
  rememberInvitation,
  rememberedInvitation,
} from './community-invitation'
it('remembers only an explicit bounded code and never silently changes a remembered invitation', () => {
  const data = new Map<string, string>()
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value)
    },
    removeItem: (key: string) => {
      data.delete(key)
    },
  }
  rememberInvitation(storage, 'first-invite', 1000)
  rememberInvitation(storage, 'different-invite', 2000)
  expect(rememberedInvitation(storage, 2000)).toBe('first-invite')
  expect(rememberedInvitation(storage, 1000 + 30 * 86400000)).toBe('')
  rememberInvitation(storage, '<script>', 1000 + 30 * 86400000)
  expect(rememberedInvitation(storage, 1000 + 30 * 86400000)).toBe('')
})
