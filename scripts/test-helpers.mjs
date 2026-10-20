import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

export const root = fileURLToPath(new URL('../', import.meta.url))
export const exec = promisify(execFile)
export function temporaryDirectory(t) {
  const directory = mkdtempSync(join(tmpdir(), 'orbit-tooling-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  return directory
}
export function executable(path, source) {
  writeFileSync(path, `#!${process.execPath}\n${source}\n`, { mode: 0o700 })
}
