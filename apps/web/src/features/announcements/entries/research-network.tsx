import { resolveCatalogArt } from '../../../ui/artwork'
import styles from '../release-announcement.module.css'

const art = resolveCatalogArt({
  kind: 'Research',
  id: 'IntergalacticResearchNetwork',
})

export default function ResearchNetworkAnnouncement() {
  return (
    <>
      <img
        className={styles.hero}
        src={art.src}
        srcSet={art.srcSet}
        sizes="(max-width: 420px) calc(100vw - 56px), 306px"
        width={art.width}
        height={art.height}
        alt=""
      />
      <p>Link your laboratories so your planets research together.</p>
      <ul>
        <li>Each level links one more eligible lab.</li>
        <li>Research finishes faster without using another research slot.</li>
        <li>Research details show which planets are contributing.</li>
      </ul>
    </>
  )
}
