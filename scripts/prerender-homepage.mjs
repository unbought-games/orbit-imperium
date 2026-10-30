import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'vite'
import react from '@vitejs/plugin-react'

// Keep external React imports resolvable from the temporary server bundle.
// The bundle is build tooling only; production continues to run just Rust.
const temporary = await mkdtemp(resolve('node_modules/.orbit-prerender-'))
try {
  await build({
    configFile: false,
    root: 'apps/web',
    plugins: [react()],
    build: {
      ssr: resolve('apps/web/src/landing-render.tsx'),
      outDir: temporary,
      emptyOutDir: true,
      rollupOptions: { output: { entryFileNames: 'render.mjs' } },
    },
  })
  const { renderLanding } = await import(
    pathToFileURL(resolve(temporary, 'render.mjs'))
  )
  const template = await readFile('apps/web/dist/homepage.html', 'utf8')
  const root = '<div id="root"></div>'
  if (template.split(root).length !== 2)
    throw Error('Homepage requires exactly one empty root before prerendering')
  for (const signupEnabled of [true, false]) {
    const filename = signupEnabled ? 'homepage.html' : 'homepage-closed.html'
    const html = template.replace(
      root,
      () => `<div id="root">${renderLanding(signupEnabled)}</div>`,
    )
    await writeFile(resolve('apps/web/dist', filename), html)
  }
} finally {
  await rm(temporary, { recursive: true, force: true })
}
