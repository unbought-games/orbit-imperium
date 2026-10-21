import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { prepareRelease, releaseHistory } from './prepare-release.mjs'

test('preparation updates all manifests, preserves editorial, and never creates a tag',()=>{
  const root=mkdtempSync(join(tmpdir(),'orbit-release-'))
  const git=(...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8'})
  try {
    git('init','-q');git('config','user.email','fixture@example.test');git('config','user.name','Fixture')
    writeFileSync(join(root,'package.json'),JSON.stringify({name:'orbit-imperium'}))
    writeFileSync(join(root,'package-lock.json'),JSON.stringify({packages:{'':{name:'orbit-imperium'}}}))
    writeFileSync(join(root,'Cargo.toml'),'[workspace.package]\nversion = "0.1.0"\n')
    writeFileSync(join(root,'Cargo.lock'),'[[package]]\nname = "orbit-server"\nversion = "0.1.0"\n\n[[package]]\nname = "serde"\nversion = "1.0.0"\n')
    git('add','.');git('commit','-qm','feat: create a universe')
    assert.equal(releaseHistory(root).version,'0.1.0')
    const first=prepareRelease(root,'0.1.0')
    assert.equal(git('tag').trim(),'')
    writeFileSync(first.notes,readFileSync(first.notes,'utf8')+'\nHuman editorial stays.\n')
    prepareRelease(root,'0.1.0')
    assert.match(readFileSync(first.notes,'utf8'),/Human editorial stays/)
    assert.equal((readFileSync(join(root,'CHANGELOG.md'),'utf8').match(/## 0.1.0/g)||[]).length,1)
    git('add','.');git('commit','-qm','chore(release): prepare 0.1.0');git('tag','v0.1.0')
    writeFileSync(join(root,'fix.txt'),'fixed');git('add','.');git('commit','-qm','fix: fleet returns')
    assert.equal(releaseHistory(root).version,'0.1.1')
    prepareRelease(root,'0.1.1')
    assert.equal(JSON.parse(readFileSync(join(root,'package.json'))).version,'0.1.1')
    assert.equal(JSON.parse(readFileSync(join(root,'package-lock.json'))).packages[''].version,'0.1.1')
    assert.match(readFileSync(join(root,'Cargo.lock'),'utf8'),/name = "orbit-server"\nversion = "0.1.1"/)
    assert.match(readFileSync(join(root,'Cargo.lock'),'utf8'),/name = "serde"\nversion = "1.0.0"/)
    assert.throws(()=>prepareRelease(root,'0.1.0'),/newer/)
  }finally{rmSync(root,{recursive:true,force:true})}
})
