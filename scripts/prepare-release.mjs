import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dump } from 'js-yaml'

export const versionPattern=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
export function recommendVersion(previous, commits) {
  if(!previous)return {version:'0.1.0',bump:'initial',editorial:true,reason:'First numbered open-source release.'}
  if(!versionPattern.test(previous))throw new Error('Invalid previous version')
  let [major,minor,patch]=previous.split('.').map(Number)
  const breaking=commits.some(c=>/^\w+(?:\([^)]+\))?!: /m.test(c.message)||/^BREAKING[ -]CHANGE: /m.test(c.message))
  const feature=commits.some(c=>/^feat(?:\([^)]+\))?: /m.test(c.message))
  const bump=breaking&&major>0?'major':breaking||feature?'minor':'patch'
  if(bump==='major'){major++;minor=0;patch=0}else if(bump==='minor'){minor++;patch=0}else patch++
  return {version:`${major}.${minor}.${patch}`,bump,editorial:bump!=='patch',reason:breaking?'Breaking changes detected; pre-1.0 breaking changes increment minor.':feature?'Feature commits detected.':'Fixes or maintenance since the previous release.'}
}
export function releaseHistory(root) {
  const git=(...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8'}).trim()
  const previousTag=git('tag','--merged','HEAD','--sort=-version:refname').split('\n').find(t=>versionPattern.test(t.replace(/^v/,''))&&t.startsWith('v'))||null
  const commits=git('log','--first-parent','--format=%H%x00%B%x00%x1e',previousTag?`${previousTag}..HEAD`:'HEAD').split('\x1e').map(s=>s.trim()).filter(Boolean).map(s=>{const [commit,message]=s.split('\0');return{commit,message:message.trim()}})
  return {previousTag,commits,head:git('rev-parse','HEAD'),...recommendVersion(previousTag?.slice(1),commits)}
}
export function prepareRelease(root,version) {
  const history=releaseHistory(root)
  version ||= history.version
  if(!versionPattern.test(version))throw new Error('Use a stable semantic version, e.g. 0.1.0')
  if(history.previousTag){
    const before=history.previousTag.slice(1).split('.').map(Number),after=version.split('.').map(Number)
    const difference=after.map((n,i)=>n-before[i]).find(n=>n!==0)||0
    if(difference<=0)throw new Error('Release must be newer than the last tag')
  }
  const directory=join(root,'docs/news/releases');mkdirSync(directory,{recursive:true})
  const file=join(directory,`v${version}.md`)
  if(!existsSync(file)) {
    const entries=history.commits.filter(c=>/^(feat|fix|perf)(\(|!?:)/.test(c.message)).map(c=>`- ${c.message.split('\n')[0].replace(/^[^:]+: /,'').replace(/[\\[\]<>*_`]/g,'\\$&')} ([${c.commit.slice(0,7)}](https://github.com/unbought-games/orbit-imperium/commit/${c.commit}))`)
    const metadata={id:`orbit-imperium-v${version.replaceAll('.','-')}`,title:`Orbit Imperium ${version}`,summary:`What's included in Orbit Imperium ${version}.`,date:new Date().toISOString(),subject:'orbit-imperium',kind:'release',template:'release',version}
    writeFileSync(file,`---\n${dump(metadata,{lineWidth:-1})}---\nThis is the ${version} open-source release of Orbit Imperium.\n\n## Changes\n\n${entries.join('\n')||'Maintenance updates. See the source comparison for the full change history.'}\n\n## Self-hosting\n\nRead the [self-hosting guide](https://github.com/unbought-games/orbit-imperium/tree/v${version}/docs/operations) before upgrading. Back up your database and review the changes for your installation.\n`)
  }
  // Preserve any announcement already written for this version; the agent edits
  // that same file. The changelog links to it instead of copying editorial prose.
  const changelog=join(root,'CHANGELOG.md')
  let text=existsSync(changelog)?readFileSync(changelog,'utf8'):'# Changelog\n'
  if(!text.includes(`## ${version}\n`))text=text.replace('# Changelog\n',`# Changelog\n\n## ${version}\n\n[Announcement and detailed notes](docs/news/releases/v${version}.md).\n`)
  writeFileSync(changelog,text)
  for(const name of ['package.json','package-lock.json']){
    const path=join(root,name),data=JSON.parse(readFileSync(path,'utf8'));data.version=version
    if(data.packages?.[''])data.packages[''].version=version
    writeFileSync(path,JSON.stringify(data,null,2)+'\n')
  }
  const cargo=join(root,'Cargo.toml');writeFileSync(cargo,readFileSync(cargo,'utf8').replace(/(\[workspace.package\]\s*\nversion = ")[^"]+/,`$1${version}`))
  const lock=join(root,'Cargo.lock');writeFileSync(lock,readFileSync(lock,'utf8').replace(/(\[\[package\]\]\nname = "orbit-[^"]+"\nversion = ")[^"]+/g,`$1${version}`))
  writeFileSync(join(root,'docs/news/release.json'),JSON.stringify({version,previousTag:history.previousTag,preparedFrom:history.head},null,2)+'\n')
  return {...history,version,notes:file}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2)
  const result=args.includes('--suggest')?releaseHistory(process.cwd()):prepareRelease(process.cwd(),args.includes('--version')?args[args.indexOf('--version')+1]:undefined)
  console.log(JSON.stringify(result,null,2))
}
