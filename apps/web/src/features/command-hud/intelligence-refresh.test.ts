import { expect, it } from 'vitest'
import { createIntelligenceRefresh } from './intelligence-refresh'
function deferred() {
  let resolve!: () => void
  let reject!: () => void
  const promise = new Promise<void>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
it('coalesces concurrent wakes into one later refresh and waits for both sources before reporting success', async () => {
  const reports = deferred(),
    mailbox = deferred()
  const errors: string[] = []
  let reportCalls = 0,
    mailboxCalls = 0
  const controller = createIntelligenceRefresh({
    available: () => true,
    reports: () => (++reportCalls === 1 ? reports.promise : Promise.resolve()),
    mailbox: () => (++mailboxCalls === 1 ? mailbox.promise : Promise.resolve()),
    onMailboxError: (error) => errors.push(error),
  })
  const pending = controller.refresh()
  await controller.refresh()
  await controller.refresh()
  mailbox.resolve()
  await Promise.resolve()
  expect(errors).toEqual([])
  expect(reportCalls).toBe(1)
  reports.resolve()
  await pending
  expect(reportCalls).toBe(2)
  expect(mailboxCalls).toBe(2)
  expect(errors).toEqual(['', ''])
  controller.dispose()
})
it('mailbox failures remain recoverable independently of report errors', async () => {
  const errors: string[] = []
  let fail = true
  const controller = createIntelligenceRefresh({
    available: () => true,
    reports: () => Promise.reject(Error('Report state owns this error')),
    mailbox: () =>
      fail ? Promise.reject(Error('Unavailable')) : Promise.resolve(),
    onMailboxError: (error) => errors.push(error),
  })
  await controller.refresh()
  fail = false
  await controller.refresh()
  expect(errors).toEqual(['Some intelligence is unavailable. Try again.', ''])
  controller.dispose()
})
it('unavailable sessions skip refresh and a queued wake rechecks availability', async () => {
  let available = false,
    calls = 0
  const reports = deferred()
  const controller = createIntelligenceRefresh({
    available: () => available,
    reports: () => {
      calls++
      return reports.promise
    },
    mailbox: () => Promise.resolve(),
    onMailboxError: () => {},
  })
  await controller.refresh()
  expect(calls).toBe(0)
  available = true
  const pending = controller.refresh()
  await controller.refresh()
  available = false
  reports.resolve()
  await pending
  expect(calls).toBe(1)
  controller.dispose()
})
it('disposal fences outstanding responses and drops queued work', async () => {
  const mailbox = deferred()
  let calls = 0
  const errors: string[] = []
  const controller = createIntelligenceRefresh({
    available: () => true,
    reports: () => {
      calls++
      return Promise.resolve()
    },
    mailbox: () => mailbox.promise,
    onMailboxError: (error) => errors.push(error),
  })
  const pending = controller.refresh()
  await controller.refresh()
  controller.dispose()
  mailbox.reject()
  await pending
  await controller.refresh()
  expect(calls).toBe(1)
  expect(errors).toEqual([])
})
