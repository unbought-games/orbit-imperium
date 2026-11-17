import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// A build artifact, never committed. Generate before the Docker build so
// the installed build includes history without needing Git in the image.
export function writeHistory(root=process.cwd()) {
  if(!existsSync(join(root,'.git')))return
  const editorial=join(root,'docs/news/excluded-commits.json')
  const excluded=existsSync(editorial)?JSON.parse(readFileSync(editorial,'utf8')):[]
  if(!Array.isArray(excluded)||excluded.some(sha=>typeof sha!=='string'||!/^[a-f0-9]{40}$/.test(sha)))throw new Error('Invalid excluded news commits')
  const raw=execFileSync('git',['-C',root,'log','--first-parent','--format=%H%x09%cI%x09%s'],{encoding:'utf8'})
  const entries=raw.split('\n').map(line=>{
    const match=line.match(/^([a-f0-9]{40})\t([^\t]+)\t(feat|fix|perf)(?:\(([^)]+)\))?!?: (.+)$/)
    return match&&!excluded.includes(match[1])&&!['ci','build','deps','release','tooling','tests'].includes(match[4])?{commit:match[1],date:match[2],text:match[5]}:null
  }).filter(Boolean)
  mkdirSync(join(root,'docs/news'),{recursive:true})
  writeFileSync(join(root,'docs/news/history.json'),JSON.stringify(entries,null,2)+'\n')
  return entries
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))writeHistory()
