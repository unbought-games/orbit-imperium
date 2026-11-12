import { expect, it } from 'vitest'
import {
  rememberInvitation,
  rememberedInvitation,
  pendingInvitation,
} from './community-invitation'
it('follows the current anonymous entry but never replaces a dispatched account-bound invitation', () => {
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
  rememberInvitation(storage, 'earlier-anonymous-link', 900)
  rememberInvitation(storage, 'first-invite', 1000)
  expect(rememberedInvitation(storage, 1000)).toBe('first-invite')
  pendingInvitation(storage, 'account', () => 'stable-operation', 1000)
  rememberInvitation(storage, 'different-invite', 2000)
  expect(rememberedInvitation(storage, 2000)).toBe('first-invite')
  expect(rememberedInvitation(storage, 1000 + 30 * 86400000)).toBe('')
  rememberInvitation(storage, '<script>', 1000 + 30 * 86400000)
  expect(rememberedInvitation(storage, 1000 + 30 * 86400000)).toBe('')
})
