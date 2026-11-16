import { AdvisorBubble } from '../../src/ui/advisor-bubble'
import { Popover } from '../../src/ui/popover'
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

export function DetailsPopoverExample({
  narrow = false,
}: {
  narrow?: boolean
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  return (
    <main style={{ padding: 24 }}>
      <Button onClick={() => dialog.current?.showModal()}>
        Open resource review
      </Button>
      <dialog
        ref={dialog}
        aria-label="Resource review"
        style={{
          width: narrow ? 240 : 'min(560px, calc(100vw - 32px))',
          transform: narrow ? 'translateZ(0)' : undefined,
          padding: 24,
          background: 'var(--surface)',
          color: 'var(--text)',
        }}
      >
        <h2>Resource review</h2>
        <Button variant="secondary">Before details</Button>
        <p>
          <Popover label="Metal" trigger="Metal · 500">
            <p>
              Available <strong>500</strong>
            </p>
            <a href="#resource-ledger">Open ledger</a>
          </Popover>
        </p>
        <p>
          <Popover
            label="Energy"
            trigger="Energy · 80"
            link={<a href="#production-settings" />}
          >
            <p>
              Energy balance <strong>80</strong>
            </p>
            <a href="#energy-ledger">Energy ledger</a>
          </Popover>
        </p>
        <Button variant="secondary" onClick={() => dialog.current?.close()}>
          Close review
        </Button>
      </dialog>
    </main>
  )
}

export function AdvisorBubbleExample() {
  const anchor = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(true)
  return (
    <main style={{ padding: 24 }}>
      <Button variant="secondary">Outside action</Button>
      <AdvisorBubble
        open={open}
        active
        onOpenChange={setOpen}
        triggerRef={anchor}
        label="Advisor message"
        triggerLabel="Toggle advisor"
        trigger={(props) => (
          <Button
            style={{ position: 'fixed', right: 24, bottom: 24 }}
            {...props}
          >
            Advisor
          </Button>
        )}
      >
        <h2>Your next directive</h2>
        <p>This message stays available while you work.</p>
        <Button onClick={() => setOpen(false)}>Dismiss guidance</Button>
      </AdvisorBubble>
    </main>
  )
}

export function NarrowDetailsPopoverExample() {
  return <DetailsPopoverExample narrow />
}
