import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { load } from 'js-yaml'
import { temporaryDirectory } from './test-helpers.mjs'

const directory = new URL('../.github/workflows/', import.meta.url)
const workflows = readdirSync(directory)
  .filter((file) => /\.ya?ml$/.test(file))
  .map((file) => ({
    file,
    workflow: load(readFileSync(new URL(file, directory), 'utf8')),
  }))

test('every workflow job uses an explicitly approved disposable runner', () => {
  assert.ok(workflows.length > 0)
  for (const { file, workflow } of workflows) {
    for (const [name, job] of Object.entries(workflow.jobs)) {
      // Also rejects dynamic routing, runner groups and reusable workflows
      // whose execution environment has not been reviewed here.
      if (file === 'publish-release.yml' && name === 'build') {
        assert.equal(job['runs-on'], '${{ matrix.runner }}')
        assert.deepEqual(job.strategy.matrix, { include: [
          { arch: 'amd64', runner: 'ubuntu-24.04' },
          { arch: 'arm64', runner: 'ubuntu-24.04-arm' },
        ] })
      } else assert.equal(job['runs-on'], 'ubuntu-24.04', `${file}: ${name}`)
    }
  }
})

test('browser jobs configure Ubuntu mirrors before installing Linux dependencies', () => {
  for (const { file, workflow } of workflows) {
    const browserJobs = Object.values(workflow.jobs).filter((job) =>
      job.steps.some((step) => /make test-(ui|explicit)/.test(step.run ?? '')),
    )
    if (file === 'ci.yml' || file === 'explicit-tests.yml')
      assert.ok(browserJobs.length > 0, file)
    for (const job of browserJobs) {
      const installIndex = job.steps.findIndex((step) =>
        /playwright install --with-deps chromium/.test(step.run ?? ''),
      )
      assert.ok(installIndex >= 0, file)
      const mirrorIndex = job.steps.findIndex((step) =>
        /tee \/etc\/apt\/apt-mirrors\.txt/.test(step.run ?? ''),
      )
      assert.ok(mirrorIndex >= 0 && mirrorIndex < installIndex, file)
      const mirrorSetup = job.steps[mirrorIndex].run
      // Capture the actual shell output without writing the host's apt config.
      // apt treats space-separated metadata as part of the URL; it needs a tab.
      const generated = spawnSync('bash', ['-e', '-c', mirrorSetup.replace(
        'sudo tee /etc/apt/apt-mirrors.txt >/dev/null',
        'cat',
      )], { encoding: 'utf8' })
      assert.equal(generated.status, 0, `${file}: ${generated.stderr}`)
      assert.equal(generated.stdout,
        'https://archive.ubuntu.com/ubuntu\tpriority:0\n' +
        'https://security.ubuntu.com/ubuntu\tpriority:1\n',
        file,
      )
    }
  }
})

test('PR checks remain automatic and full validation remains dispatch-only', () => {
  const ci = workflows.find(({ file }) => file === 'ci.yml').workflow
  const explicit = workflows.find(
    ({ file }) => file === 'explicit-tests.yml',
  ).workflow
  assert.ok(Object.hasOwn(ci.on, 'pull_request'))
  assert.ok(!Object.hasOwn(ci.on, 'pull_request_target'))
  assert.deepEqual(Object.keys(explicit.on), ['workflow_dispatch'])
  for (const { file, workflow } of workflows) {
    assert.deepEqual(workflow.permissions, { contents: 'read' }, file)
    for (const [name, job] of Object.entries(workflow.jobs)) {
      if (file === 'ci.yml' && name === 'check') {
        // The aggregate gate evaluates job results without fetching PR code.
        assert.ok(
          job.steps.every((step) => !step.uses),
          file,
        )
        continue
      }
      const checkout = job.steps.find((step) =>
        step.uses?.startsWith('actions/checkout@'),
      )
      assert.equal(checkout?.with?.['persist-credentials'], false, file)
    }
  }
})

test('merge queue checks use the complete integration group without cancelling other events', () => {
  const ci = workflows.find(({ file }) => file === 'ci.yml').workflow
  assert.deepEqual(ci.on.merge_group, { types: ['checks_requested'] })
  const scope = ci.jobs.scope.steps.find((step) => step.id === 'integration')
  assert.equal(scope.env.BASE_SHA,
    '${{ github.event.merge_group.base_sha || github.event.pull_request.base.sha || github.event.before }}')
  assert.equal(ci.concurrency.group,
    "${{ github.workflow }}-${{ github.event_name }}-${{ github.event_name == 'pull_request' && github.ref || github.sha }}")
  assert.equal(ci.concurrency['cancel-in-progress'], "${{ github.event_name == 'pull_request' }}")
})

test('integration selection includes earlier queued changes and fails safe without a valid base', (t) => {
  const root = temporaryDirectory(t)
  const repository = join(root, 'repository')
  mkdirSync(repository)
  const git = (...args) => {
    const result = spawnSync('git', args, {
      cwd: repository,
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'CI fixture', GIT_AUTHOR_EMAIL: 'ci@example.test',
        GIT_COMMITTER_NAME: 'CI fixture', GIT_COMMITTER_EMAIL: 'ci@example.test',
      },
    })
    assert.equal(result.status, 0, result.stderr)
    return result.stdout.trim()
  }
  const commit = (path) => {
    mkdirSync(dirname(join(repository, path)), { recursive: true })
    writeFileSync(join(repository, path), path)
    git('add', path)
    git('-c', 'commit.gpgsign=false', 'commit', '-m', path)
    return git('rev-parse', 'HEAD')
  }
  git('init', '--quiet')
  const base = commit('README.md')
  const scope = workflows.find(({ file }) => file === 'ci.yml').workflow.jobs.scope
    .steps.find((step) => step.id === 'integration')
  const select = (sha) => {
    const output = join(root, 'outputs')
    writeFileSync(output, '')
    const result = spawnSync('bash', ['-e', '-c', scope.run], {
      cwd: repository,
      encoding: 'utf8',
      env: { ...process.env, BASE_SHA: sha, RUNNER_TEMP: root, GITHUB_OUTPUT: output },
    })
    assert.equal(result.status, 0, result.stderr)
    return readFileSync(output, 'utf8')
  }
  const docs = commit('docs/queue.md')
  assert.equal(select(base), 'database=false\nui=false\n')
  const web = commit('apps/web/src/queue.ts')
  assert.equal(select(docs), 'database=false\nui=true\n')
  commit('crates/storage-postgres/migrations/9999_queue.sql')
  const database = git('rev-parse', 'HEAD')
  commit('docs/last-in-queue.md')
  assert.equal(select(database), 'database=false\nui=false\n')
  assert.equal(select(web), 'database=true\nui=true\n')
  assert.equal(select(base), 'database=true\nui=true\n')
  assert.equal(select(''), 'database=true\nui=true\n')
  assert.equal(select('unavailable-base'), 'database=true\nui=true\n')
})

test('fixture browsers start independently of native compilation and stay routine-only', () => {
  const { jobs } = workflows.find(({ file }) => file === 'ci.yml').workflow
  assert.equal(jobs.native.needs, 'scope')
  assert.equal(jobs.browser.needs, 'scope')
  assert.equal(jobs.browser.if, "needs.scope.outputs.ui == 'true'")
  assert.ok(jobs.native.steps.some((step) => step.run === 'make check'))
  const database = jobs.native.steps.find((step) => step.run === 'make test-db')
  assert.equal(database.if, "needs.scope.outputs.database == 'true'")
  assert.ok(jobs.browser.steps.some((step) => step.run === 'make test-ui'))
  assert.ok(
    !jobs.browser.steps.some((step) => /cargo|rustup/.test(step.run ?? '')),
  )
  const commands = Object.values(jobs).flatMap((job) =>
    job.steps.map((step) => step.run ?? ''),
  )
  assert.ok(
    !commands.some((command) =>
      /make test-(explicit|acceptance|container)/.test(command),
    ),
  )
})

test('the stable required check rejects failed, cancelled or unexpectedly skipped jobs', () => {
  const { check } = workflows.find(({ file }) => file === 'ci.yml').workflow
    .jobs
  assert.equal(check.name, 'Build, lint and unit tests')
  assert.equal(check.if, 'always()')
  assert.deepEqual(check.needs, ['scope', 'native', 'browser'])
  assert.equal(check.steps.length, 1)
  const gate = check.steps[0]
  assert.deepEqual(gate.env, {
    SCOPE_RESULT: '${{ needs.scope.result }}',
    NATIVE_RESULT: '${{ needs.native.result }}',
    UI_SELECTED: '${{ needs.scope.outputs.ui }}',
    BROWSER_RESULT: '${{ needs.browser.result }}',
  })
  const success = {
    SCOPE_RESULT: 'success',
    NATIVE_RESULT: 'success',
    UI_SELECTED: 'true',
    BROWSER_RESULT: 'success',
  }
  const run = (overrides) =>
    spawnSync('bash', ['-e', '-c', gate.run], {
      env: { ...process.env, ...success, ...overrides },
    }).status
  assert.equal(run({}), 0)
  assert.equal(run({ UI_SELECTED: 'false', BROWSER_RESULT: 'skipped' }), 0)
  for (const key of ['SCOPE_RESULT', 'NATIVE_RESULT', 'BROWSER_RESULT']) {
    for (const result of ['failure', 'cancelled', 'skipped']) {
      assert.notEqual(run({ [key]: result }), 0, `${key}=${result}`)
    }
  }
  assert.notEqual(run({ UI_SELECTED: '' }), 0)
  assert.notEqual(run({ UI_SELECTED: 'false' }), 0)
  assert.notEqual(run({ UI_SELECTED: 'false', BROWSER_RESULT: 'failure' }), 0)
})

test('browser shards run independently and Make forwards their native Playwright selector', () => {
  const { browser } = workflows.find(({ file }) => file === 'ci.yml').workflow.jobs
  assert.equal(browser.strategy['fail-fast'], false)
  assert.equal(browser.strategy['max-parallel'], 3)
  assert.deepEqual(browser.strategy.matrix.shard, [1, 2, 3])
  const run = browser.steps.find((step) => step.run === 'make test-ui')
  assert.equal(run.env.UI_SHARD, '${{ matrix.shard }}/${{ strategy.job-total }}')
  const root = new URL('../', import.meta.url)
  for (const shard of ['', '1/3', '2/3', '3/3']) {
    const dryRun = spawnSync('make', ['--no-print-directory', '-n', 'test-ui', `UI_SHARD=${shard}`], {
      cwd: root,
      encoding: 'utf8',
    })
    assert.equal(dryRun.status, 0, dryRun.stderr)
    assert.equal(dryRun.stdout.trim(), `npm run test:ui${shard ? ` -- --shard=${shard}` : ''}`)
  }
})

test('fixture browser failure diagnostics are downloadable without capturing successful tests', () => {
  const { browser } = workflows.find(({ file }) => file === 'ci.yml').workflow.jobs
  const upload = browser.steps.find((step) => step.uses?.startsWith('actions/upload-artifact@'))
  assert.equal(upload.if, 'failure()')
  assert.deepEqual(upload.with.path.trim().split('\n'), [
    'test-results/browser-ui/',
    'test-results/browser-homepage/',
  ])
  assert.equal(upload.with['retention-days'], 7)
  assert.equal(upload.with['if-no-files-found'], 'ignore')
  assert.equal(upload.with.name, 'browser-failures-${{ github.run_id }}-${{ github.run_attempt }}-shard-${{ matrix.shard }}')
})

test('routine CI and continuous image publication have no custom execution deadlines', () => {
  for (const { file, workflow } of workflows.filter(({ file }) =>
    ['ci.yml', 'release-image.yml'].includes(file),
  )) {
    for (const [name, job] of Object.entries(workflow.jobs)) {
      assert.equal(job['timeout-minutes'], undefined, `${file}: ${name}`)
      for (const step of job.steps)
        assert.equal(step['timeout-minutes'], undefined, `${file}: ${name}: ${step.name}`)
    }
  }
})
