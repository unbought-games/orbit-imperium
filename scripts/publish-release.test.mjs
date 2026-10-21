import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

test('publication tags the prepared commit, retries idempotently, and rejects a moved release',()=>{
  const root=mkdtempSync(join(tmpdir(),'orbit-publish-')),repo=join(root,'repo'),remote=join(root,'remote'),bin=join(root,'bin')
  const script=resolve('scripts/publish-release.mjs')
  const git=(...args)=>execFileSync('git',['-C',repo,...args],{encoding:'utf8'}).trim()
  try{
    mkdirSync(repo);mkdirSync(bin);execFileSync('git',['init','--bare','-q',remote]);git('init','-q');git('config','user.email','fixture@example.test');git('config','user.name','Fixture');git('remote','add','origin',remote)
    writeFileSync(join(repo,'package.json'),JSON.stringify({version:'0.1.0'}));writeFileSync(join(repo,'Cargo.toml'),'[workspace.package]\nversion = "0.1.0"\n')
    git('add','.');git('commit','-qm','feat: game');const base=git('rev-parse','HEAD')
    mkdirSync(join(repo,'docs/news/releases'),{recursive:true})
    // A preparation snapshot can be a branch commit dropped by squash merge.
    const snapshot=execFileSync('git',['-C',repo,'commit-tree',git('rev-parse',base+'^{tree}'),'-p',base],{input:'editorial snapshot\n',encoding:'utf8'}).trim()
    writeFileSync(join(repo,'docs/news/release.json'),JSON.stringify({version:'0.1.0',preparedFrom:snapshot}))
    writeFileSync(join(repo,'docs/news/releases/v0.1.0.md'),"---\nid: orbit-v0-1-0\ntitle: First release\ndate: '2026-10-21T12:00:00Z'\nversion: 0.1.0\nkind: release\n---\nPrepared editorial")
    git('add','.');git('commit','-qm','chore(release): prepare 0.1.0');const sha=git('rev-parse','HEAD');git('push','-q','origin','HEAD:main')
    writeFileSync(join(bin,'gh'),`#!/usr/bin/env node\nconst {execFileSync}=require('node:child_process');const args=process.argv.slice(2);const ref=args.find(a=>a.startsWith('ref=')).slice(4);const sha=args.find(a=>a.startsWith('sha=')).slice(4);execFileSync('git',['--git-dir',process.env.FIXTURE_REMOTE,'update-ref',ref,sha]);`,{mode:0o755})
    const env={...process.env,PATH:bin+':'+process.env.PATH,FIXTURE_REMOTE:remote,GITHUB_OUTPUT:join(root,'output'),GITHUB_EVENT_NAME:'workflow_run',GITHUB_REF:'refs/heads/main',RELEASE_TAG:''}
    const publish=()=>spawnSync(process.execPath,[script],{cwd:repo,env,encoding:'utf8'})
    let result=publish();assert.equal(result.status,0,result.stderr);assert.match(readFileSync(env.GITHUB_OUTPUT,'utf8'),new RegExp(`sha=${sha}`));assert.equal(readFileSync(join(repo,'release-notes.md'),'utf8'),'Prepared editorial')
    result=publish();assert.equal(result.status,0,result.stderr)
    writeFileSync(join(repo,'extra'),'later');git('add','extra');git('commit','-qm','fix: later change');env.GITHUB_EVENT_NAME='push';env.GITHUB_REF='refs/tags/v0.1.0'
    result=publish();assert.notEqual(result.status,0);assert.match(result.stderr,/Existing immutable tag names a different commit/)
    assert.equal(execFileSync('git',['--git-dir',remote,'rev-parse','refs/tags/v0.1.0'],{encoding:'utf8'}).trim(),sha)
  }finally{rmSync(root,{recursive:true,force:true})}
})
