import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { buildNews, readNote } from './news.mjs'
import { recommendVersion } from './prepare-release.mjs'

test('version suggestions use full commit messages and pre-1.0 policy',()=>{
  const commits=message=>[{message}]
  assert.equal(recommendVersion(null,[]).version,'0.1.0')
  assert.equal(recommendVersion('0.1.0',commits('fix: return fleets')).version,'0.1.1')
  assert.equal(recommendVersion('0.1.0',commits('feat: alliance roles')).version,'0.2.0')
  assert.equal(recommendVersion('0.1.0',commits('fix!: new rules')).version,'0.2.0')
  assert.equal(recommendVersion('1.2.3',commits('feat: rules\n\nBREAKING CHANGE: schema')).version,'2.0.0')
  assert.equal(recommendVersion('1.2.3',commits('fix: return fleets')).editorial,false)
})
test('game updates build without Git or any Unbought service and omit drafts',()=>{
  const root=mkdtempSync(join(tmpdir(),'orbit-news-'))
  try {
    const dir=join(root,'docs/news/changes');mkdirSync(dir,{recursive:true})
    const note="---\nid: beta\ntitle: Beta\ndate: '2026-10-21T12:00:00Z'\n---\n<script>alert(1)</script>\n\n## Play"
    writeFileSync(join(dir,'beta.md'),note)
    writeFileSync(join(dir,'draft.md'),note.replace('id: beta','id: draft\ndraft: true'))
    assert.equal(buildNews(root).length,1)
    const page=readFileSync(join(root,'apps/web/public/updates/beta.html'),'utf8')
    assert.doesNotMatch(page,/<script>/)
    assert.match(page,/Return to Orbit Imperium/)
    assert.throws(()=>readNote('no metadata'))
  }finally{rmSync(root,{recursive:true,force:true})}
})
