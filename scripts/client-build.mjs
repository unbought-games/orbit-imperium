import { randomUUID } from 'node:crypto'

// The asset build owns this identity; the server reads the shipped metadata.
// It must not depend on a runtime environment variable or package semver.
export function clientBuildPlugin() {
  let id
  return {
    name: 'orbit-client-build',
    config(_, { command }) {
      id = command === 'build' ? randomUUID() : 'development'
      return { define: { 'import.meta.env.ORBIT_CLIENT_BUILD': JSON.stringify(id) } }
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'client-build.json', source: JSON.stringify({ id }) })
    },
  }
}
