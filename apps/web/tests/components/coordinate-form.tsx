import { useState } from 'react'
import { CoordinateInput } from '../../src/ui/coordinate-input'
import { Field, NumberInput } from '../../src/ui/form'

export function CoordinateForm() {
  const [coordinates, setCoordinates] = useState('')
  const [metal, setMetal] = useState('0')
  return (
    <main>
      <CoordinateInput
        value={coordinates}
        onChange={setCoordinates}
        universe="Andromeda"
      />
      <Field>
        Metal
        <NumberInput
          value={metal}
          onChange={(event) => setMetal(event.target.value)}
        />
      </Field>
    </main>
  )
}
