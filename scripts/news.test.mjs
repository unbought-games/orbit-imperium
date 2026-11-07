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
    assert.match(page,/href="https:\/\/github.com\/unbought-games\/orbit-imperium"/)
    assert.doesNotMatch(page,/source\.tar\.gz/)
    assert.throws(()=>readNote('no metadata'))
  }finally{rmSync(root,{recursive:true,force:true})}
})
test('only curated notes become in-game announcements, newest first, with a bounded window',()=>{
  const root=mkdtempSync(join(tmpdir(),'orbit-news-'))
  try {
    const dir=join(root,'docs/news/changes');mkdirSync(dir,{recursive:true})
    const note=(id,date,extra='')=>`---\nid: ${id}\ntitle: ${id} title\ndate: '${date}'\n${extra}---\nBody`
    writeFileSync(join(dir,'quiet.md'),note('quiet','2026-11-03T00:00:00Z','summary: Not picked\n'))
    writeFileSync(join(dir,'older.md'),note('older','2026-11-01T00:00:00Z','announce: true\nsummary: Older pick\n'))
    writeFileSync(join(dir,'newer.md'),note('newer','2026-11-05T00:00:00Z',"announce: true\nsummary: ' Newer pick '\nannounce_until: '2026-11-08T00:00:00Z'\n"))
    writeFileSync(join(dir,'draft.md'),note('draft','2026-11-06T00:00:00Z','draft: true\nannounce: true\nsummary: Hidden\n'))
    buildNews(root)
    const feed=JSON.parse(readFileSync(join(root,'apps/web/public/updates/announcements.json'),'utf8'))
    assert.deepEqual(feed,{version:1,announcements:[
      {id:'newer',title:'newer title',summary:'Newer pick',date:'2026-11-05T00:00:00.000Z',until:'2026-11-08T00:00:00.000Z',href:'/updates/newer.html'},
      {id:'older',title:'older title',summary:'Older pick',date:'2026-11-01T00:00:00.000Z',until:'2026-12-01T00:00:00.000Z',href:'/updates/older.html'},
    ]})
    assert.throws(()=>readNote(note('bad','2026-11-01T00:00:00Z','announce: true\n')),/need a summary/)
    assert.throws(()=>readNote(note('bad','2026-11-01T00:00:00Z','announce: yes please\nsummary: x\n')),/true or false/)
    assert.throws(()=>readNote(note('bad','2026-11-01T00:00:00Z',"announce: true\nsummary: x\nannounce_until: '2026-10-01T00:00:00Z'\n")),/after date/)
  }finally{rmSync(root,{recursive:true,force:true})}
})
