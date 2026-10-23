import type { CatalogSelection } from '../../shell/use-catalog-selection'
import type { components } from '../../contracts'
import type { Coordinator } from '../../client-model/coordinator'
import { type Command } from '../../client-model/commands'
import { pendingCommand } from '../../client-model/game-projection'
import type { Page } from '../../shell/routes'
export type ProgressionProps = {
  selection: CatalogSelection
  coordinator: Coordinator
  view:
    | components['schemas']['BoundView3']
    | components['schemas']['BoundView4']
  body: components['schemas']['BodyV3']
  page: Page
}
export function pending(model: Coordinator, command: Command) {
  return pendingCommand(model.store.getState(), command)
}
