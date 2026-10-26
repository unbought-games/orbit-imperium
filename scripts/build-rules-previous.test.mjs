import { test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { temporaryDirectory, executable, exec, root } from './test-helpers.mjs'

test('rules previous build requires a configuration-aware bridge source', async (t) => {
  const directory = temporaryDirectory(t)
  const git = join(directory, 'git')
  const cargo = join(directory, 'cargo')
  const tar = join(directory, 'tar')
  executable(git, `
    const args = process.argv.slice(2)
    if (args[0] === 'rev-parse') console.log('same-source-sha')
    else if (args[0] === 'show') console.log(process.env.NO_CONFIG_FEATURE === '1' ? '[features]' : '[features]\\nuniverse-config-bridge = []')
    else if (args[0] === 'cat-file') process.exit(process.env.NO_CONFIG_BRIDGE === '1' && args[2].includes('universe_cli') ? 1 : 0)
  `)
  executable(cargo, 'console.log(JSON.stringify(process.argv.slice(2)))')
  executable(tar, 'process.stdin.resume()')
  const env = { ...process.env, PATH: `${directory}:${process.env.PATH}` }
  delete env.ORBIT_PREVIOUS_SERVER
  delete env.ORBIT_RULES_PREVIOUS_REF
  await assert.rejects(exec('sh', ['scripts/build-rules-previous.sh'], { cwd: root, signal: t.signal, env }),
    error => /configuration-aware bridge/.test(error.stderr))
  const configured = { ...env, ORBIT_RULES_PREVIOUS_REF: 'HEAD' }
  const { stdout } = await exec('sh', ['scripts/build-rules-previous.sh'], { cwd: root, signal: t.signal, env: configured })
  const args = JSON.parse(stdout)
  assert.equal(args[args.indexOf('--features') + 1], 'test-support,universe-config-bridge')
  assert.ok(args.includes('--locked'))
  await assert.rejects(exec('sh', ['scripts/build-rules-previous.sh'], {
    cwd: root, signal: t.signal, env: { ...configured, NO_CONFIG_BRIDGE: '1' },
  }), error => /universe configuration bridge/.test(error.stderr))
  await assert.rejects(exec('sh', ['scripts/build-rules-previous.sh'], {
    cwd: root, signal: t.signal, env: { ...configured, NO_CONFIG_FEATURE: '1' },
  }), error => /bridge feature/.test(error.stderr))

})
