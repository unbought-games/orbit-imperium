// Local development defaults; replace this process with the Rust server.
import { randomUUID } from 'node:crypto'
import { parseArgs } from 'node:util'

let args = process.argv.slice(2)
try {
  if (['dev-seed', 'dev-reset'].includes(args[0])) {
    const command = args[0]
    const { values } = parseArgs({
      args: args.slice(1),
      options: { universe: { type: 'string' }, at: { type: 'string' } },
    })
    if (command === 'dev-reset' && !values.universe)
      throw Error('--universe is required for dev-reset')
    const universe = values.universe ?? randomUUID()
    if (
      !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(
        universe,
      )
    )
      throw Error('--universe must be a UUID')
    const at = values.at ?? String(Date.now())
    if (!/^\d+$/.test(at))
      throw Error('--at must be nonnegative Unix milliseconds')
    args = [command, '--universe', universe, '--at', at]
    await new Promise((resolve, reject) => {
      process.stdout.write(
        `${command}: UNIVERSE=${universe} AT=${at}\n`,
        (error) => (error ? reject(error) : resolve()),
      )
    })
  }
  const env = { ...process.env }
  env.DATABASE_URL ??= `postgres://orbit:${encodeURIComponent(env.ORBIT_DB_PASSWORD || 'orbit')}@127.0.0.1:55432/orbit`
  env.ORBIT_SEED_PASSWORD_FILE ??= '.secrets/players'
  env.ORBIT_LOCAL_INSECURE ??= '1'
  process.execve('target/debug/orbit', ['orbit', ...args], env)
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
