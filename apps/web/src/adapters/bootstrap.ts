import type { Bootstrap } from '../client-model/bootstrap'
import { validate } from '../client-model/schema'
export function readEmbeddedBootstrap(document: Document): Bootstrap | null {
  const nodes = document.querySelectorAll('#orbit-bootstrap')
  const text =
    nodes.length === 1 && nodes[0].getAttribute('type') === 'application/json'
      ? nodes[0].textContent
      : null
  nodes.forEach((node) => node.remove())
  try {
    return text?.trim()
      ? validate<Bootstrap>('Bootstrap', JSON.parse(text))
      : null
  } catch {
    return null
  }
}
