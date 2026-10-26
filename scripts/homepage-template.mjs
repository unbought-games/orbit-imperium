import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export function homepageTemplate(template) {
  const entry = 'src="/src/main.tsx"'
  if (template.split(entry).length !== 2 ||
      !template.includes('<!--orbit-page-metadata:start-->') ||
      !template.includes('<!--orbit-page-metadata:end-->'))
    throw Error('Homepage requires one game entry and complete metadata markers')
  return template.replace(entry, 'src="/src/landing-main.tsx"')
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  writeFileSync('apps/web/homepage.html', homepageTemplate(readFileSync('apps/web/index.html', 'utf8')))
}
