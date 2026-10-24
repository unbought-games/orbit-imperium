import { readFileSync, readdirSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import MarkdownIt from 'markdown-it'
import { load, JSON_SCHEMA } from 'js-yaml'

export const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
export function readNote(source) {
  const match=source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
  if (!match) throw new Error('News needs YAML frontmatter')
  const note=load(match[1],{schema:JSON_SCHEMA})
  if (!note || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(note.id) || typeof note.title!=='string' || !Number.isFinite(Date.parse(note.date))) throw new Error('Invalid news identity/title/date')
  return {...note,body:match[2]}
}
export function buildNews(root=process.cwd()) {
  const notes=[]
  for (const section of ['changes','releases']) {
    const directory=join(root,'docs/news',section)
    if (!existsSync(directory)) continue
    for (const file of readdirSync(directory).filter(f=>f.endsWith('.md'))) {
      const note=readNote(readFileSync(join(directory,file),'utf8'))
      if (!note.draft) notes.push({...note,section})
    }
  }
  notes.sort((a,b)=>Date.parse(b.date)-Date.parse(a.date)||a.id.localeCompare(b.id))
  const md=new MarkdownIt({html:false})
  md.renderer.rules.heading_open=(tokens,index)=>{
    const level=Math.max(2,Number(tokens[index].tag.slice(1)))
    tokens[index].tag=tokens[index+2].tag=`h${level}`
    const base=tokens[index+1].content.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'section'
    return `<h${level} id="${base}"><a href="#${base}" aria-label="Link to this section">#</a> `
  }
  const output=join(root,'apps/web/public/updates')
  rmSync(output,{recursive:true,force:true});mkdirSync(output,{recursive:true})
  const page=(title,body)=>`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} · Orbit Imperium</title><meta name="description" content="Release notes and changes included in this Orbit Imperium build."><link rel="stylesheet" href="/updates/style.css"><link rel="icon" href="/brand-mark.svg"></head><body><header><a href="/">← Return to Orbit Imperium</a><a href="/updates/index.html">All updates</a></header><main>${body}</main><footer>Notes included in this server's build. Availability depends on its operator. <a href="https://github.com/unbought-games/orbit-imperium">View on GitHub</a>.</footer></body></html>`
  const ids=new Set()
  for (const note of notes) {
    if(ids.has(note.id))throw new Error(`Duplicate note ${note.id}`);ids.add(note.id)
    writeFileSync(join(output,note.id+'.html'),page(note.title,`<article><p class="meta">${note.version?'Version '+escape(note.version):'Build update'} · <time datetime="${escape(note.date)}">${escape(note.date.slice(0,10))}</time></p><h1>${escape(note.title)}</h1>${md.render(note.body)}</article>`))
  }
  const historyFile=join(root,'docs/news/history.json')
  const history=existsSync(historyFile)?JSON.parse(readFileSync(historyFile,'utf8')):[]
  writeFileSync(join(output,'index.html'),page("What's new",`<h1>What's new</h1><p>Changes and release notes included in this build.</p>${notes.map(n=>`<article><p class="meta">${escape(n.date.slice(0,10))}${n.version?' · Version '+escape(n.version):''}</p><h2><a href="/updates/${n.id}.html">${escape(n.title)}</a></h2>${n.summary?`<p>${escape(n.summary)}</p>`:''}</article>`).join('')}${history.length?'<p><a href="/updates/history-1.html">Browse the full change history →</a></p>':''}`))
  for(let start=0;start<history.length;start+=30){
    const pageNumber=start/30+1,total=Math.ceil(history.length/30)
    const rows=history.slice(start,start+30).map(entry=>{
      if(!/^[a-f0-9]{40}$/.test(entry.commit)||typeof entry.date!=='string'||typeof entry.text!=='string')throw new Error('Invalid bundled history')
      return `<article id="commit-${entry.commit}"><p class="meta">${escape(entry.date.slice(0,10))}</p><p>${escape(entry.text)}</p><a href="https://github.com/unbought-games/orbit-imperium/commit/${entry.commit}">Source change ↗</a></article>`
    }).join('')
    writeFileSync(join(output,`history-${pageNumber}.html`),page('Change history',`<h1>Change history</h1><p>Player-facing Conventional Commits included in this build.</p>${rows}<nav aria-label="Pagination">${pageNumber>1?`<a href="/updates/history-${pageNumber-1}.html">← Newer</a> · `:''}Page ${pageNumber} of ${total}${pageNumber<total?` · <a href="/updates/history-${pageNumber+1}.html">Older →</a>`:''}</nav>`))
  }
  writeFileSync(join(output,'style.css'),`*{box-sizing:border-box}body{margin:0 auto;max-width:900px;padding:clamp(20px,5vw,56px);background:#11151d;color:#e2e8ee;font:17px/1.8 system-ui,sans-serif}a{color:#a8c9e2;text-underline-offset:4px}a:focus-visible{outline:3px solid #a8c9e2;outline-offset:5px}header{display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap;font-size:14px}main{margin:64px 0}h1{font-size:clamp(34px,6vw,54px);line-height:1.15}h2{font-size:26px;line-height:1.3;margin-top:40px}article{margin:32px 0;border-top:1px solid #34404d;padding-top:24px;overflow-wrap:anywhere}.meta,footer{color:#acb9c6;font-size:13px}pre{overflow:auto;padding:20px;background:#202733}img{max-width:100%;height:auto}footer{border-top:1px solid #34404d;padding-top:24px}`)
  return notes
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(`Built ${buildNews().length} local game updates`)
