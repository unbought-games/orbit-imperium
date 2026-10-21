import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// A build artifact, never committed. Including it in the source archive makes
// the installed build's history available even when rebuilt without Git.
export function writeHistory(root=process.cwd()) {
  if(!existsSync(join(root,'.git')))return
  const raw=execFileSync('git',['-C',root,'log','--first-parent','--format=%H%x09%cI%x09%s'],{encoding:'utf8'})
  const entries=raw.split('\n').map(line=>{
    const match=line.match(/^([a-f0-9]{40})\t([^\t]+)\t(feat|fix|perf)(?:\(([^)]+)\))?!?: (.+)$/)
    return match&&!['ci','build','deps','release','tooling','tests'].includes(match[4])?{commit:match[1],date:match[2],text:match[5]}:null
  }).filter(Boolean)
  mkdirSync(join(root,'docs/news'),{recursive:true})
  writeFileSync(join(root,'docs/news/history.json'),JSON.stringify(entries,null,2)+'\n')
  return entries
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))writeHistory()
