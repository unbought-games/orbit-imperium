import { ButtonLinkAnchor } from '../../ui/button'
import styles from './alliances.module.css'

export function RecruitmentImage({
  path,
  name,
  tag,
}: {
  path: string
  name: string
  tag: string
}) {
  const src = `${path}/image`
  return (
    <figure className={styles.recruitmentImage}>
      <img
        src={src}
        alt={`${name} recruitment poster`}
        width={1200}
        height={630}
        loading="lazy"
      />
      <figcaption>
        <ButtonLinkAnchor
          variant="secondary"
          href={src}
          download={`${tag}-recruitment.png`}
        >
          Download recruitment image
        </ButtonLinkAnchor>
      </figcaption>
    </figure>
  )
}
