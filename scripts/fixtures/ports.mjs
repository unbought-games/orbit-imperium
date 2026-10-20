import { createServer } from 'node:net'
import assert from 'node:assert/strict'

// Hold through bootstrap and reacquire after every stop; release before spawning the
// real server. Explicit overrides fail on conflicts instead of probing another
// worktree's server and mistaking its readiness for ours.
export async function reserveTestPort(requested) {
  const port = requested === undefined ? 0 : Number(requested)
  assert.ok(
    Number.isInteger(port) && port >= 0 && port <= 65535,
    'Invalid test port',
  )
  const listener = createServer((socket) => socket.destroy())
  let assigned = port
  let held = false
  async function hold() {
    if (held) return
    await new Promise((resolve, reject) => {
      const cleanup = () => {
        listener.removeListener('error', onError)
        listener.removeListener('listening', onListening)
      }
      const onError = (error) => {
        cleanup()
        reject(error)
      }
      const onListening = () => {
        cleanup()
        resolve()
      }
      listener.once('error', onError)
      listener.once('listening', onListening)
      listener.listen(assigned, '127.0.0.1')
    })
    listener.unref()
    assigned = listener.address().port
    held = true
  }
  await hold()
  return {
    port: assigned,
    hold,
    async release() {
      if (!held) return
      await new Promise((resolve, reject) =>
        listener.close((error) => (error ? reject(error) : resolve())),
      )
      held = false
    },
  }
}
