import { test } from 'node:test'
import assert from 'node:assert/strict'
import { copyFileSync, mkdirSync } from 'node:fs'
import { join, delimiter } from 'node:path'
import { randomUUID } from 'node:crypto'
import { temporaryDirectory, executable, exec, root } from './test-helpers.mjs'

test('container build and smoke use the same requested image', async (t) => {
  const directory = temporaryDirectory(t)
  copyFileSync(join(root, 'Makefile'), join(directory, 'Makefile'))
  for (const command of ['docker', 'node']) {
    executable(
      join(directory, command),
      `console.log(JSON.stringify({command: require('node:path').basename(process.argv[1]), args: process.argv.slice(2), image: process.env.ORBIT_TEST_IMAGE}))`,
    )
  }
  const env = {
    ...process.env,
    PATH: `${directory}${delimiter}${process.env.PATH}`,
    ORBIT_TEST_IMAGE: 'orbit-imperium:owned-test',
  }
  delete env.MAKEFLAGS
  delete env.MFLAGS
  const { stdout } = await exec('make', ['-s', '_container'], {
    cwd: directory,
    env,
    signal: t.signal,
  })
  const [build, smoke, isolation] = stdout
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
  assert.deepEqual(build.args, ['build', '-t', env.ORBIT_TEST_IMAGE, '.'])
  assert.deepEqual(smoke.args, ['scripts/container-smoke.mjs'])
  assert.equal(smoke.image, env.ORBIT_TEST_IMAGE)
  assert.deepEqual(isolation.args, ['--test', 'scripts/ci-isolation.test.mjs'])
})

test(
  'database ports, credentials and cleanup are isolated between Compose projects',
  {
    skip:
      process.env.ORBIT_TEST_CI_DOCKER !== '1' &&
      'explicit-only: set ORBIT_TEST_CI_DOCKER=1',
  },
  async (t) => {
    const directory = temporaryDirectory(t)
    const prefix =
      process.env.COMPOSE_PROJECT_NAME || `orbit-isolation-${randomUUID()}`
    const projects = [0, 1].map((index) => {
      const cwd = join(directory, String(index))
      mkdirSync(cwd)
      copyFileSync(join(root, 'compose.yaml'), join(cwd, 'compose.yaml'))
      const password = index === 0 ? 'orbit' : `override@:/?#%${randomUUID()}`
      const env = {
        ...process.env,
        COMPOSE_PROJECT_NAME: `${prefix}-probe-${index}`,
        ORBIT_DB_PUBLISHED_PORT: '0',
      }
      delete env.COMPOSE_FILE
      delete env.ORBIT_DB_PASSWORD
      if (index === 1) env.ORBIT_DB_PASSWORD = password
      return { cwd, env, password }
    })
    const compose = async (project, ...args) =>
      (
        await exec('docker', ['compose', ...args], {
          cwd: project.cwd,
          env: project.env,
        })
      ).stdout.trim()
    const query = (project, password) =>
      compose(
        project,
        'exec',
        '-T',
        '-e',
        `PGPASSWORD=${password}`,
        'db',
        'psql',
        '-h',
        'db',
        '-U',
        'orbit',
        '-d',
        'orbit',
        '-Atc',
        'SELECT 1',
      )
    try {
      // Wait for both starts even if one fails, so cleanup cannot race a late start.
      const starts = await Promise.allSettled(
        projects.map((project) => compose(project, 'up', '-d', '--wait', 'db')),
      )
      for (const start of starts)
        if (start.status === 'rejected') throw start.reason
      const addresses = await Promise.all(
        projects.map((project) => compose(project, 'port', 'db', '5432')),
      )
      assert.notEqual(addresses[0], addresses[1])
      for (const address of addresses) {
        assert.match(address, /^127\.0\.0\.1:\d+$/)
        assert.ok(Number(address.split(':').at(-1)) > 0)
      }
      for (const project of projects)
        assert.equal(await query(project, project.password), '1')
      await assert.rejects(
        query(projects[0], projects[1].password),
        /password authentication failed/,
      )
      await compose(projects[0], 'down', '--volumes', '--remove-orphans')
      assert.equal(await query(projects[1], projects[1].password), '1')
    } finally {
      const cleanup = await Promise.allSettled(
        projects.map((project) =>
          compose(project, 'down', '--volumes', '--remove-orphans'),
        ),
      )
      const failures = cleanup.filter((result) => result.status === 'rejected')
      if (failures.length)
        throw new AggregateError(
          failures.map((result) => result.reason),
          'Compose cleanup failed',
        )
    }
  },
)
