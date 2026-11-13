import {readFileSync, readdirSync, writeFileSync} from 'node:fs'
const routes = new Set(['/'])
for (const name of readdirSync('apps/web/src/routes')) {
  if (!/\.tsx?$/.test(name) || name.startsWith('__')) continue
  const source = readFileSync('apps/web/src/routes/' + name, 'utf8')
  for (const match of source.matchAll(/createFileRoute\(\s*['"]([^'"]+)['"]\)/g)) {
    if (match[1].split('/').includes('$')) continue
    routes.add(match[1].replace(/\$([A-Za-z]+)/g, ':$1').replace(/_\//g, '/').replace(/\/$/, '') || '/')
  }
}
const publicRoutes = readFileSync('apps/web/src/public-route-patterns.ts', 'utf8')
for (const match of publicRoutes.matchAll(/: '(\/[^']+)'/g)) routes.add(match[1])
for (const name of ['crates/server/src/community_rewards.rs', 'crates/transport-http/src/lib.rs']) {
  for (const match of readFileSync(name, 'utf8').matchAll(/\.route\(\s*"(\/[^"{}]*(?:\{[^}]+\}[^"{}]*)*)"/g)) {
    if (!match[1].startsWith('/api/') && !match[1].includes('.')) routes.add(match[1].replace(/\{([^}]+)\}/g, ':$1'))
  }
}
writeFileSync('apps/web/src/analytics-routes.json', JSON.stringify([...routes].sort(), null, 2) + '\n')
