import { canonical } from './commands'
import { commandTime } from './command-window'
import { validate } from './schema'

type Command = { command_id: string }
// Each immutable envelope has its own key. Other tabs can finish it without
// replacing a whole ledger or resurrecting records another tab already removed.
export class PendingCommands {
  constructor(private storage: () => Storage) {}

  private prefix(schema: string, scope: string) {
    return 'orbit:command-window:1:' + schema + ':' + scope + ':'
  }

  load<T extends Command>(schema: string, scope: string): T[] {
    const prefix = this.prefix(schema, scope)
    let storage: Storage
    try {
      storage = this.storage()
    } catch {
      return []
    }
    const rows: T[] = []
    for (const key of Object.keys(storage)) {
      if (!key.startsWith(prefix)) continue
      try {
        const row = validate<T>(schema, JSON.parse(storage.getItem(key)!))
        if (
          commandTime(row.command_id) !== null &&
          key === prefix + row.command_id
        )
          rows.push(row)
      } catch {
        // An interrupted, corrupt or newer-format record cannot authorize a POST.
      }
    }
    return rows
  }

  save<T extends Command>(schema: string, scope: string, row: T) {
    const storage = this.storage()
    const key = this.prefix(schema, scope) + row.command_id
    const previous = storage.getItem(key)
    const serialized = JSON.stringify(row)
    if (previous !== null) {
      if (canonical(JSON.parse(previous)) !== canonical(JSON.parse(serialized)))
        throw Error('A different order already uses this ID.')
      return
    }
    storage.setItem(key, serialized)
  }

  remove(schema: string, scope: string, id: string) {
    this.storage().removeItem(this.prefix(schema, scope) + id)
  }
}
