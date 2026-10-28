// Backward-compatible operator launcher. Local playground lifecycle is local-world.mjs.
const args = process.argv.slice(2)
if (['dev-seed', 'dev-reset'].includes(args[0])) {
  console.error(
    'dev-seed/dev-reset were retired. Use make dev, make dev-reset, or ./orbit world --help.',
  )
  process.exitCode = 1
} else {
  const env = { ...process.env }
  env.DATABASE_URL ??= `postgres://orbit:${encodeURIComponent(env.ORBIT_DB_PASSWORD || 'orbit')}@127.0.0.1:55432/orbit`
  env.ORBIT_ALLOW_INSECURE_HTTP ??= '1'
  process.execve('target/debug/orbit', ['orbit', ...args], env)
}
