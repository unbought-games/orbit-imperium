import { test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import { parse } from 'smol-toml'
import { temporaryDirectory, executable, exec, root } from './test-helpers.mjs'

test('deployment selects rolling strategy and the requested app without extra hosts', async (t) => {
  const directory = temporaryDirectory(t)
  const fly = join(directory, 'fly')
  executable(fly, 'console.log(JSON.stringify(process.argv.slice(2)))')
  const { stdout } = await exec('sh', ['scripts/fly.sh', 'deploy'], {
    cwd: root,
    signal: t.signal,
    env: {
      ...process.env,
      FLY_HA: '',
      FLY: fly,
      FLY_APP: 'migration-test',
      FLY_CONFIG: 'deploy/fly.toml',
    },
  })
  const args = JSON.parse(stdout)
  assert.equal(args[0], 'deploy')
  assert.equal(args[args.indexOf('--app') + 1], 'migration-test')
  assert.equal(args[args.indexOf('--strategy') + 1], 'rolling')
  assert.ok(args.includes('--ha=false'))
})

test('production templates require HA before invoking Fly', async (t) => {
  const directory = temporaryDirectory(t)
  const fly = join(directory, 'fly')
  executable(fly, 'console.log(JSON.stringify(process.argv.slice(2)))')
  const env = { ...process.env, FLY: fly, FLY_APP: 'production-api', FLY_CONFIG: 'deploy/fly.api.toml' }
  delete env.FLY_HA
  for (const action of ['launch', 'deploy']) {
    const { stdout } = await exec('sh', ['scripts/fly.sh', action], { cwd: root, signal: t.signal, env })
    const args = stdout.trim().split('\n').map(JSON.parse).at(-1)
    assert.ok(args.includes('--ha=true'))
    assert.ok(args.includes('production-api'))
    assert.ok(args.includes('deploy/fly.api.toml'))
  }
  for (const FLY_HA of ['false', 'auto', '1']) {
    await assert.rejects(exec('sh', ['scripts/fly.sh', 'deploy'], {
      cwd: root, signal: t.signal, env: { ...env, FLY_HA },
    }), (error) => error.code !== 0 && error.stdout === '')
  }
})

test('role templates reserve connections and keep worker metrics private', () => {
  for (const [role, connections] of [['api', 20], ['worker', 8]]) {
    const config = parse(readFileSync(join(root, `deploy/fly.${role}.toml`), 'utf8'))
    const env = config.env
    assert.equal(env.ORBIT_ROLE, role)
    assert.equal(['ADMISSION', 'READS', 'WORKER', 'CONTROL'].reduce((total, kind) => total + Number(env[`ORBIT_POOL_${kind}`]), 0), connections)
    assert.ok(config.kill_timeout >= Number(env.ORBIT_DRAIN_MS) / 1000 + 6)
    assert.equal(config.metrics.port, 9091)
    if (role === 'api') {
      assert.equal(config.http_service.min_machines_running, 2)
      assert.equal(config.http_service.internal_port, 8080)
    } else {
      assert.equal(config.http_service, undefined)
      assert.equal(config.services, undefined)
      assert.equal(config.checks.worker.port, 9091)
    }
  }
})

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


test('deployment templates contain only process inputs, leaving universe policy to the CLI', () => {
  const retired = ['SPEED', 'GALAXIES', 'SYSTEMS_PER_GALAXY', 'POSITIONS_PER_SYSTEM', 'MAX_PLAYERS', 'SIGNUP_ENABLED', 'SIGNUP_PER_MINUTE', 'COMMANDS_PER_MINUTE']
  for (const file of ['fly.toml', 'fly.api.toml', 'fly.worker.toml']) {
    const config = parse(readFileSync(join(root, 'deploy', file), 'utf8'))
    for (const variable of retired) assert.equal(config.env[`ORBIT_${variable}`], undefined, `${file}: retire ${variable}`)
  }
})
