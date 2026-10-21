import { execFileSync } from 'node:child_process'
import {
  copyFileSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Include the actual build inputs, including local modifications. Do not depend
// on Git being installed: released source archives must also be rebuildable.
export const sourceEntries = [
  '.config',
  '.github',
  'apps',
  'contracts',
  'crates',
  'deploy',
  'docs',
  'fixtures',
  'rules',
  'scripts',
  '.dockerignore',
  '.env.example',
  '.gitignore',
  '.node-version',
  '.prettierignore',
  '.prettierrc.json',
  'AGENTS.md',
  'Cargo.lock',
  'Cargo.toml',
  'Dockerfile',
  'LICENSE',
  'Makefile',
  'README.md',
  'compose.yaml',
  'eslint.config.js',
  'package-lock.json',
  'package.json',
  'playwright.config.ts',
  'rust-toolchain.toml',
]

const excluded = new Set([
  '.git',
  '.secrets',
  '.local',
  '.superpowers',
  '.vite',
  '.tanstack',
  'node_modules',
  'target',
  'dist',
  'test-results',
  'playwright-report',
])

function exclude(path, name) {
  return (
    excluded.has(name) ||
    (name.startsWith('.env') && name !== '.env.example') ||
    /\.(pem|key|p12|pfx)$/i.test(name) ||
    path.startsWith('apps/web/public/source.tar.gz') ||
    path === 'apps/web/public/LICENSE.txt'
  )
}

export function sourceFiles(root) {
  const files = []
  function visit(path) {
    const name = path.split('/').at(-1)
    if (exclude(path, name)) return
    const stat = lstatSync(join(root, path))
    if (stat.isSymbolicLink())
      throw new Error(`Source archive cannot include symlink: ${path}`)
    if (stat.isDirectory()) {
      for (const child of readdirSync(join(root, path)).sort())
        visit(`${path}/${child}`)
    } else if (stat.isFile()) {
      files.push(path)
    } else {
      throw new Error(`Source archive cannot include special file: ${path}`)
    }
  }
  for (const entry of sourceEntries) visit(entry)
  return files
}

export function packageSource(root) {
  const output = join(root, 'apps/web/public/source.tar.gz')
  const list = `${output}.files`
  const temporary = `${output}.tmp`
  const files = sourceFiles(root)
  mkdirSync(dirname(output), { recursive: true })
  try {
    writeFileSync(list, files.map((path) => `./${path}\0`).join(''))
    execFileSync('tar', ['-czf', temporary, '-C', root, '--null', '-T', list], {
      // macOS otherwise adds AppleDouble metadata not present in the sources.
      env: { ...process.env, COPYFILE_DISABLE: '1' },
      stdio: 'pipe',
    })
    copyFileSync(temporary, output)
    copyFileSync(
      join(root, 'LICENSE'),
      join(root, 'apps/web/public/LICENSE.txt'),
    )
  } finally {
    rmSync(list, { force: true })
    rmSync(temporary, { force: true })
  }
  return output
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  console.log(`Packaged deployed source: ${packageSource(process.cwd())}`)
}
