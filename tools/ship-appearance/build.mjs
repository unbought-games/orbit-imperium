import { build } from 'vite'
await build({
  configFile: new URL('./vite.config.mjs', import.meta.url).pathname,
})
