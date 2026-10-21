import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { readNote } from './news.mjs'
import { versionPattern } from './prepare-release.mjs'

// The same workflow creates the tag and publishes it. GITHUB_TOKEN-created tags
// do not trigger another push workflow, so publication must not rely on that.
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim()
const gh=(...args)=>execFileSync('gh',args,{encoding:'utf8'}).trim()
const descriptor=JSON.parse(readFileSync('docs/news/release.json','utf8'))
const {version,preparedFrom}=descriptor
if(!versionPattern.test(version)||!/^[a-f0-9]{40}$/.test(preparedFrom))throw new Error('Invalid release descriptor')
const tag='v'+version,sha=git('rev-parse','HEAD')
git('merge-base','--is-ancestor',preparedFrom,sha)
const metadata=JSON.parse(readFileSync('package.json','utf8'))
if(metadata.version!==version||!readFileSync('Cargo.toml','utf8').includes(`version = "${version}"`))throw new Error('Package versions disagree')
const note=readNote(readFileSync(`docs/news/releases/${tag}.md`,'utf8'))
if(note.draft||note.version!==version||note.kind!=='release')throw new Error('Release notes are not ready')
if(process.env.GITHUB_REF?.startsWith('refs/tags/')&&process.env.GITHUB_REF!==`refs/tags/${tag}`)throw new Error('Tag disagrees with prepared release')
if(process.env.RELEASE_TAG && process.env.RELEASE_TAG!==tag)throw new Error('Recovery tag disagrees with prepared release')
// A main push must actually contain the release preparation. A later unrelated
// commit must not accidentally acquire the existing version's tag.
if(process.env.GITHUB_EVENT_NAME==='workflow_run'&&!git('diff-tree','--no-commit-id','--name-only','-r','HEAD').split('\n').includes('docs/news/release.json'))throw new Error('This commit does not prepare a release')
const remote=git('ls-remote','--tags','origin',`refs/tags/${tag}`,`refs/tags/${tag}^{}`)
if(remote){
  const lines=remote.split('\n');const actual=(lines.find(s=>s.endsWith('^{}'))||lines[0]).split(/\s/)[0]
  if(actual!==sha)throw new Error('Existing immutable tag names a different commit')
}else gh('api','repos/unbought-games/orbit-imperium/git/refs','-f',`ref=refs/tags/${tag}`,'-f',`sha=${sha}`)
writeFileSync('release-notes.md',note.body)
writeFileSync(process.env.GITHUB_OUTPUT,`tag=${tag}\nsha=${sha}\ntitle=${note.title.replace(/[\r\n]/g,' ')}\n`)
