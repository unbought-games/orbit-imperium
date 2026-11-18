import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'

// Explicit acceptance worlds can run days ahead of (or decades behind) this process.
export function commandIdAt(milliseconds) {
  const bytes = randomBytes(16)
  bytes.writeUIntBE(milliseconds, 0, 6)
  bytes[6] = (bytes[6] & 0x0f) | 0x70
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-')
}

export function pairedPresenceId(gameplayId) {
  return gameplayId.slice(0, -1) + (parseInt(gameplayId.at(-1), 16) ^ 1).toString(16)
}

export async function assertReplayResponse(response, id, now) {
  const issued = parseInt(id.replaceAll('-', '').slice(0, 12), 16)
  if (now - issued < 900_000) {
    assert.equal(response.status, 202)
  } else {
    assert.equal(response.status, 409)
    assert.equal((await response.json()).code, 'COMMAND_EXPIRED')
  }
}
