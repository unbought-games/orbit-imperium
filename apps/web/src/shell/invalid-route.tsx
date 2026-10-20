import { useEffect, useRef } from 'react'
import { Heading, Text } from '../ui/typography'
import { Link } from '../ui/link'
import { StatePanel } from '../ui/state-panel'
export function InvalidRoute() {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    document.title = 'Unavailable · Orbit Imperium'
    heading.current?.focus()
  }, [])
  return (
    <main id="main" tabIndex={-1}>
      <Heading level={1} ref={heading} tabIndex={-1}>
        Destination unavailable
      </Heading>
      <StatePanel title="Choose an available destination">
        <Text>This address or its planet context is unavailable.</Text>
        <Link to="/">Open your universe overview</Link>
      </StatePanel>
    </main>
  )
}
