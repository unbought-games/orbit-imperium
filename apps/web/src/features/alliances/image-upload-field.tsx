import { useId } from 'react'
import { Field } from '../../ui/form'

export function ImageUploadField({
  label,
  maxFileBytes = 20 * 1024 * 1024,
  onSelect,
}: {
  label: string
  maxFileBytes?: number
  onSelect: (file: File) => void
}) {
  const id = useId()
  return (
    <Field>
      <span id={`${id}-label`}>{label}</span>
      <input
        type="file"
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-guidance`}
        disabled={maxFileBytes === 0}
        accept="image/png,image/jpeg,image/gif,image/webp"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) onSelect(file)
        }}
      />
      <small id={`${id}-guidance`}>
        {maxFileBytes === 0 ? (
          'New uploads are disabled on this server. Saved images remain available.'
        ) : (
          <>
            PNG, JPEG, GIF, or WebP. Up to 4096 × 4096 pixels and{' '}
            {maxFileBytes / 1048576} MiB per image. Animated GIF and WebP are
            supported.
          </>
        )}
      </small>
    </Field>
  )
}
