/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it, vi } from 'vitest'
import { commandId } from './command-id'
import { browserDependencies } from './runtime'

it('creates RFC 4122 version 4 command IDs without the secure-context randomUUID API', () => {
  for (const [fill, expected] of [
    [0, '00000000-0000-4000-8000-000000000000'],
    [255, 'ffffffff-ffff-4fff-bfff-ffffffffffff'],
  ] as const) {
    let calls = 0
    const source: Pick<Crypto, 'getRandomValues'> = {
      getRandomValues: (array) => {
        if (!(array instanceof Uint8Array)) throw Error('Expected UUID bytes')
        expect(array.byteLength).toBe(16)
        array.fill(fill)
        calls++
        return array
      },
    }
    expect(commandId(source)).toBe(expected)
    expect(calls).toBe(1)
  }
})

it('wires HTTP-compatible IDs into the browser command platform', () => {
  vi.stubGlobal('crypto', {
    getRandomValues: (array: Uint8Array) => array.fill(0xaa),
  })
  try {
    expect(browserDependencies().platform.newId()).toBe(
      'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
    )
  } finally {
    vi.unstubAllGlobals()
  }
})

it('keeps app code off randomUUID, which plain-HTTP origins do not provide', () => {
  const root = fileURLToPath(new URL('..', import.meta.url))
  const sources = readdirSync(root, {
    recursive: true,
    encoding: 'utf8',
  }).filter((path) => /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path))
  expect(sources.length).toBeGreaterThan(100)
  expect(
    sources.filter((path) =>
      /crypto\.randomUUID\(/.test(readFileSync(join(root, path), 'utf8')),
    ),
  ).toEqual([])
})
