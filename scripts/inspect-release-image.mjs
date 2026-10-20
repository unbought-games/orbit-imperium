import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export function verifyReleaseFiles(directory, root) {
  for (const name of [
    'source.tar.gz',
    'LICENSE.txt',
    'third-party.txt',
    'rust-notices.txt',
  ])
    assert.ok(statSync(join(directory, name)).size > 0, `Missing/empty ${name}`)
  assert.deepEqual(
    readFileSync(join(directory, 'LICENSE.txt')),
    readFileSync(join(root, 'LICENSE')),
  )
  const archive = join(directory, 'source.tar.gz')
  const names = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' })
    .trim()
    .split('\n')
  for (const name of [
    'LICENSE',
    'Cargo.lock',
    'package-lock.json',
    'Dockerfile',
    'scripts/package-source.mjs',
    'crates/server/src/main.rs',
    'apps/web/src/main.tsx',
  ]) {
    assert.ok(names.includes(`./${name}`), `Source archive missing ${name}`)
    assert.deepEqual(
      execFileSync('tar', ['-xOzf', archive, `./${name}`]),
      readFileSync(join(root, name)),
      `Source differs: ${name}`,
    )
  }
  for (const name of names) {
    assert.ok(
      name.startsWith('./') && !name.split('/').includes('..'),
      `Unsafe source path: ${name}`,
    )
    assert.doesNotMatch(
      name,
      /(^|\/)(\.git|\.secrets|\.superpowers|node_modules|target|dist)(\/|$)/,
    )
    assert.doesNotMatch(
      name,
      /^\.\/docs\/(specs|game|plans|verification|superpowers)\//,
    )
    assert.doesNotMatch(name, /(^|\/)\.env(?!\.example$)|\.(pem|key|p12|pfx)$/i)
  }
  assert.match(
    readFileSync(join(directory, 'third-party.txt'), 'utf8'),
    /react/i,
  )
  assert.match(
    readFileSync(join(directory, 'rust-notices.txt'), 'utf8'),
    /MIT|Apache/,
  )
  return names.length
}

export function inspectReleaseImage(image, sha, root = process.cwd()) {
  const config = JSON.parse(
    execFileSync('docker', ['image', 'inspect', image], { encoding: 'utf8' }),
  )[0]
  assert.equal(config.Config.Labels['org.opencontainers.image.revision'], sha)
  assert.equal(config.Config.User, 'orbit')
  assert.deepEqual(config.Config.Entrypoint, ['orbit'])
  assert.deepEqual(config.Config.Cmd, ['serve'])
  assert.ok(
    !config.Config.Env.some((value) => value.startsWith('ORBIT_ROLE=')),
    'Role must be selected at runtime',
  )
  const directory = mkdtempSync(join(tmpdir(), 'orbit-release-'))
  let container
  try {
    // Never start the application or a database: inspect the actual built layers.
    container = execFileSync('docker', ['create', image], {
      encoding: 'utf8',
    }).trim()
    for (const name of [
      'source.tar.gz',
      'LICENSE.txt',
      'third-party.txt',
      'rust-notices.txt',
    ])
      execFileSync('docker', [
        'cp',
        `${container}:/app/web/${name}`,
        join(directory, name),
      ])
    console.log(
      `Release image verified: ${verifyReleaseFiles(directory, root)} source files, license, web and Rust notices; runtime API/worker selection`,
    )
  } finally {
    try {
      if (container)
        execFileSync('docker', ['rm', container], { stdio: 'pipe' })
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  inspectReleaseImage(
    process.env.ORBIT_RELEASE_IMAGE,
    process.env.ORBIT_RELEASE_SHA,
  )
