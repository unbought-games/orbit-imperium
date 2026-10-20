import { it, expect, vi } from 'vitest'
import { readEmbeddedBootstrap } from './bootstrap'
function documentFor(text: string, count = 1) {
  const nodes = Array.from({ length: count }, () => ({
    textContent: text,
    getAttribute: () => 'application/json',
    remove: vi.fn(),
  }))
  return {
    document: { querySelectorAll: () => nodes } as unknown as Document,
    nodes,
  }
}
it('consumes validated JSON and removes the transport payload', () => {
  const payload = {
    version: 1,
    signup_enabled: true,
    result: { status: 'anonymous' },
  }
  const { document, nodes } = documentFor(JSON.stringify(payload))
  expect(readEmbeddedBootstrap(document)).toEqual(payload)
  expect(nodes[0].remove).toHaveBeenCalledOnce()
})
it('rejects empty, malformed, duplicate, absent and unsupported payloads', () => {
  for (const [text, count] of [
    ['', 1],
    ['{', 1],
    ['{}', 1],
    ['{}', 2],
    ['', 0],
    [
      JSON.stringify({
        version: 2,
        signup_enabled: true,
        result: { status: 'anonymous' },
      }),
      1,
    ],
  ] as const) {
    const { document, nodes } = documentFor(text, count)
    expect(readEmbeddedBootstrap(document)).toBeNull()
    for (const n of nodes) expect(n.remove).toHaveBeenCalledOnce()
  }
})
