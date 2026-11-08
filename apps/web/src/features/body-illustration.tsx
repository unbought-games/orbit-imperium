import { resolveBodyArt, type BodyArtIdentity } from '../ui/artwork'
import { useBodyAppearance } from './body-appearance'

/** Decorative only: identity and mission facts remain selectable HTML. */
export function BodyIllustration({
  body,
  className,
  sizes,
}: {
  body: BodyArtIdentity
  className: string
  sizes: string
}) {
  const appearance = useBodyAppearance('id' in body ? body.id : undefined)
  const art = resolveBodyArt(
    body.kind === 'Planet' && appearance ? { ...body, appearance } : body,
  )
  return (
    <img
      data-touch-control=""
      className={className}
      src={art.thumbnail}
      srcSet={art.srcSet}
      sizes={sizes}
      width={art.width}
      height={art.height}
      alt=""
      loading="lazy"
      decoding="async"
      onError={(event) => {
        event.currentTarget.style.visibility = 'hidden'
      }}
      onLoad={(event) => {
        event.currentTarget.style.visibility = 'visible'
      }}
    />
  )
}
