import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, posix } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

// Validate the explicit COPY layout used by our Dockerfile, not Docker syntax
// generally. Dockerfile/.dockerignore edits also require a real image build.
export function copiedInputs(dockerfile, root) {
  const stages = new Map()
  let stage
  let workdir = '/'
  for (const raw of dockerfile.split('\n')) {
    const line = raw.trim()
    if (/^FROM /i.test(line)) {
      stage = line.match(/ AS (\w+)$/i)?.[1]
      workdir = '/'
      if (stage) stages.set(stage, [])
    } else if (stage && /^WORKDIR /i.test(line)) {
      workdir = posix.resolve(workdir, line.slice(8).trim())
    } else if (stage && /^COPY /i.test(line)) {
      const args = line.slice(5).trim().split(/\s+/)
      const from = args[0].startsWith('--from=') ? args.shift().slice(7) : null
      if (
        args.length < 2 ||
        args.some((arg) => /["'\[\]*?$\\]/.test(arg) || arg.startsWith('--'))
      )
        throw new Error(
          `Unsupported COPY syntax; update input verification: ${line}`,
        )
      const destination = posix.resolve(workdir, args.pop())
      for (const source of args)
        stages.get(stage).push({ from, source, destination })
    }
  }
  const contains = (name, filename) =>
    (stages.get(name) ?? []).some((copy) => {
      // Stage inputs preserve repository paths under /build in this Dockerfile.
      const local = copy.from ? relative('/build', copy.source) : copy.source
      const directory =
        existsSync(join(root, local)) &&
        statSync(join(root, local)).isDirectory()
      const target =
        directory || copy.destination !== '/build'
          ? copy.destination
          : posix.join(copy.destination, posix.basename(copy.source))
      const suffix = posix.relative(target, filename)
      if (
        suffix.startsWith('../') ||
        posix.isAbsolute(suffix) ||
        (!directory && suffix !== '')
      )
        return false
      return copy.from
        ? contains(copy.from, posix.join(copy.source, suffix))
        : existsSync(join(root, copy.source, suffix))
    })
  return contains
}

export function compilerInputs(root) {
  const configPath = join(root, 'apps/web/tsconfig.json')
  const config = ts.readConfigFile(configPath, ts.sys.readFile)
  if (config.error)
    throw new Error(
      ts.flattenDiagnosticMessageText(config.error.messageText, '\n'),
    )
  const parsed = ts.parseJsonConfigFileContent(
    config.config,
    ts.sys,
    dirname(configPath),
  )
  if (parsed.errors.length)
    throw new Error('Cannot read TypeScript project inputs')
  const program = ts.createProgram(parsed.fileNames, parsed.options)
  const web = new Set()
  for (const source of program.getSourceFiles()) {
    const file = relative(root, source.fileName)
    if (file.includes('node_modules/') || file.startsWith('../')) continue
    web.add(file)
    // Include CSS/images and other relative assets that TypeScript declarations
    // accept without listing them as source files. Vite validates their contents.
    for (const imported of ts.preProcessFile(source.text).importedFiles) {
      if (!imported.fileName.startsWith('.')) continue
      const asset = resolve(dirname(source.fileName), imported.fileName)
      if (existsSync(asset) && statSync(asset).isFile())
        web.add(relative(root, asset))
    }
  }
  // This generated file is a production include_str! input outside crates/.
  // Guard the previous cross-stage regression without treating cfg(test)
  // fixtures as runtime inputs or trying to parse Rust with regular expressions.
  return { web: [...web], rust: ['apps/web/src/analytics-routes.json'] }
}

export function missingInputs(dockerfile, root, inputs) {
  const contains = copiedInputs(dockerfile, root)
  return Object.entries(inputs).flatMap(([stage, files]) =>
    files
      .filter((file) => !contains(stage, `/build/${file}`))
      .map((file) => `${stage}: ${file}`),
  )
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const root = process.cwd()
  const started = performance.now()
  const inputs = compilerInputs(root)
  const missing = missingInputs(
    readFileSync('Dockerfile', 'utf8'),
    root,
    inputs,
  )
  if (missing.length)
    throw new Error(
      `Release image omits compiler inputs:\n${missing.join('\n')}`,
    )
  console.log(
    `Release image inputs verified (${inputs.web.length} web, ${inputs.rust.length} Rust; ${((performance.now() - started) / 1000).toFixed(2)}s)`,
  )
}
