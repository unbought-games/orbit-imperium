import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { EmpireInsignia } from '../../apps/web/src/features/empire-insignia'
import { emblems, appearances } from './emblem-fixtures'
import './emblems.css'
const params = new URLSearchParams(location.search)
function App() {
  const [emblem, setEmblem] = useState('crown'),
    [palette, setPalette] = useState('navy'),
    [treatment, setTreatment] = useState('layers'),
    [placement, setPlacement] = useState('paired')
  if (params.has('capture'))
    return (
      <main className="sources">
        {emblems.map((e, i) => (
          <section key={e.id}>
            <h2>{e.name}</h2>
            {['full', 'layers'].map((mode) => (
              <div
                key={mode}
                className={`texture ${mode}`}
                data-texture={`${e.id}-${mode}`}
              >
                <EmpireInsignia appearance={appearances[i]} size="large" />
              </div>
            ))}
          </section>
        ))}
      </main>
    )
  const path = `./output/emblems/${emblem}-${palette}-${treatment}-${placement}.png`
  return (
    <main className="review">
      <header>
        <p>ORBIT IMPERIUM / AUTHORING STUDY</p>
        <h1>An empire’s signature.</h1>
        <p>Concord · deterministic paint and insignia placement</p>
      </header>
      <div className="controls">
        <div>
          <label htmlFor="emblem">Empire insignia</label>
          <select
            id="emblem"
            value={emblem}
            onChange={(e) => setEmblem(e.target.value)}
          >
            {emblems.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="palette">Hull palette</label>
          <select
            id="palette"
            value={palette}
            onChange={(e) => setPalette(e.target.value)}
          >
            {[
              ['navy', 'Navy / Gold'],
              ['rose', 'Rose / Platinum'],
              ['pearl', 'Porcelain / Rose gold'],
              ['midnight', 'Obsidian / Copper'],
            ].map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="treatment">Emblem treatment</label>
          <select
            id="treatment"
            value={treatment}
            onChange={(e) => setTreatment(e.target.value)}
          >
            <option value="layers">Painted layers · no background</option>
            <option value="full">Full insignia · original background</option>
          </select>
        </div>
        <div>
          <label htmlFor="placement">Placement</label>
          <select
            id="placement"
            value={placement}
            onChange={(e) => setPlacement(e.target.value)}
          >
            <option value="paired">Paired wings</option>
            <option value="single">Near wing only</option>
          </select>
        </div>
      </div>
      <div className="stage">
        <img
          key={path}
          src={path}
          alt={`${emblems.find((e) => e.id === emblem)?.name} on Concord`}
        />
      </div>
      <div className="notes">
        <div className="identity">
          <EmpireInsignia
            appearance={appearances[emblems.findIndex((e) => e.id === emblem)]}
            size="medium"
          />
          <p>
            Original empire insignia
            <br />
            <small>
              {treatment === 'full'
                ? 'Shape, layers and background retained.'
                : 'All symbol layers and colors retained; background and border omitted by explicit choice.'}
            </small>
          </p>
        </div>
        <p>
          Paint follows the fixed wing surface and its lighting.
          <br />
          <small>
            Existing gold identification stripes remain part of the master.
          </small>
        </p>
      </div>
      <section className="sizes">
        <h2>At game scale</h2>
        <div>
          <figure>
            <img width="320" src={path} alt="320 pixel ship preview" />
            <figcaption>320 px · catalog card</figcaption>
          </figure>
          <figure>
            <img width="160" src={path} alt="160 pixel ship preview" />
            <figcaption>160 px · compact artwork</figcaption>
          </figure>
          <figure>
            <img width="80" src={path} alt="80 pixel ship preview" />
            <figcaption>80 px · thumbnail</figcaption>
          </figure>
        </div>
      </section>
      <p className="disclosure">
        Local proof using public game artwork and the actual EmpireInsignia
        component. Example compositions; no saved player data. No AI calls.
      </p>
    </main>
  )
}
createRoot(document.getElementById('root')!).render(<App />)
