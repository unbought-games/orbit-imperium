import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { packageSource, sourceEntries, sourceFiles } from './package-source.mjs'

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'orbit-source-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const directories = new Set([
    '.config',
    '.github',
    'apps',
    'contracts',
    'crates',
    'deploy',
    'docs',
    'fixtures',
    'rules',
    'scripts',
  ])
  for (const entry of sourceEntries) {
    if (directories.has(entry))
      mkdirSync(join(root, entry), { recursive: true })
    else
      writeFileSync(
        join(root, entry),
        entry === 'LICENSE' ? 'fixture license\n' : `${entry}\n`,
      )
  }
  function write(path, text) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  return { root, write }
}

test('packages current frontend/backend sources, build instructions and notices without Git or private/build files', (t) => {
  const { root, write } = fixture(t)
  write('crates/server/src/main.rs', 'changed backend\n')
  write('apps/web/src/main.tsx', 'changed frontend\n')
  write('apps/web/public/art/master.png', 'art source\n')
  write('apps/web/public/art/NOTICE', 'third-party notice\n')
  write('scripts/build.mjs', 'build instructions\n')
  for (const path of [
    '.env',
    '.git/config',
    '.secrets/password',
    'apps/web/.env.production',
    'apps/web/.local/password',
    'apps/web/node_modules/private.txt',
    'apps/web/dist/old.js',
    'crates/server/target/old',
    'docs/key.pem',
    'apps/web/public/source.tar.gz',
  ])
    write(path, 'must not be published')
  const archive = packageSource(root)
  const listing = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' })
  assert.match(listing, /crates\/server\/src\/main.rs/)
  assert.match(listing, /apps\/web\/src\/main.tsx/)
  assert.match(listing, /art\/master.png/)
  assert.match(listing, /art\/NOTICE/)
  assert.match(listing, /README.md/)
  assert.match(listing, /Cargo.lock/)
  assert.match(listing, /\.env.example/)
  assert.doesNotMatch(
    listing,
    /source.tar.gz|LICENSE.txt|node_modules|\/dist\/|\/target\/|\.env.production|\.secrets|\.local|key.pem|\.git\/config/,
  )
  assert.equal(
    execFileSync('tar', ['-xOzf', archive, './crates/server/src/main.rs'], {
      encoding: 'utf8',
    }),
    'changed backend\n',
  )
  assert.equal(
    readFileSync(join(root, 'apps/web/public/LICENSE.txt'), 'utf8'),
    'fixture license\n',
  )
  write('crates/server/src/main.rs', 'next backend\n')
  packageSource(root)
  assert.equal(
    execFileSync('tar', ['-xOzf', archive, './crates/server/src/main.rs'], {
      encoding: 'utf8',
    }),
    'next backend\n',
  )
  assert.equal(existsSync(`${archive}.files`), false)
  assert.equal(existsSync(`${archive}.tmp`), false)
})

test('refuses incomplete source trees and symlinks to files outside the release', (t) => {
  const { root } = fixture(t)
  symlinkSync('/etc/passwd', join(root, 'apps/external'))
  assert.throws(() => sourceFiles(root), /symlink/)
  rmSync(join(root, 'apps/external'))
  rmSync(join(root, 'Cargo.lock'))
  assert.throws(() => packageSource(root), /Cargo.lock/)
})
