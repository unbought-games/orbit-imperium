import { useRef, useState } from 'react'
import { ActionPopover } from '../../src/ui/action-popover'
import { Button } from '../../src/ui/button'
import { Field, Form, NumberInput } from '../../src/ui/form'

export function PopoverExample() {
  const anchor = useRef<HTMLButtonElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [quantity, setQuantity] = useState('1')
  const [submitted, setSubmitted] = useState('')
  return (
    <main>
      <Button ref={anchor} onClick={() => setOpen(true)}>
        Open action
      </Button>
      <output aria-label="Submitted order">{submitted}</output>
      <ActionPopover
        open={open}
        onOpenChange={setOpen}
        anchorRef={anchor}
        initialFocusRef={input}
        title="Review order"
      >
        <Form
          onSubmit={(event) => {
            event.preventDefault()
            setSubmitted(quantity)
            setOpen(false)
          }}
        >
          <Field>
            Quantity
            <NumberInput
              ref={input}
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
          </Field>
          <Button type="submit">Confirm order</Button>
        </Form>
      </ActionPopover>
    </main>
  )
}
