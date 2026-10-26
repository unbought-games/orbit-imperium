/** Only an exact anonymous bootstrap may skip the full game startup/validation. */
export function anonymousLanding(payload: unknown): boolean | null {
  if (!payload || typeof payload !== 'object') return null
  const value = payload as Record<string, unknown>
  if (
    value.version !== 1 ||
    typeof value.signup_enabled !== 'boolean' ||
    !value.result ||
    typeof value.result !== 'object'
  )
    return null
  const result = value.result as Record<string, unknown>
  return result.status === 'anonymous' && Object.keys(result).length === 1
    ? value.signup_enabled
    : null
}

export function readAnonymousLanding(document: Document, pathname: string) {
  if (pathname !== '/') return null
  const nodes = document.querySelectorAll('#orbit-bootstrap')
  if (
    nodes.length !== 1 ||
    nodes[0].getAttribute('type') !== 'application/json'
  )
    return null
  try {
    const signup = anonymousLanding(JSON.parse(nodes[0].textContent ?? ''))
    if (signup !== null) nodes[0].remove()
    return signup
  } catch {
    return null
  }
}
