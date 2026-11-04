import { createFileRoute, Navigate, useLocation } from '@tanstack/react-router'
import {
  recruitmentEntry,
  recruitmentEntryPath,
} from '../client-model/recruitment'
export const Route = createFileRoute('/join/$universe')({ component: Join })
function Join() {
  const href = useLocation({ select: (location) => location.href })
  const entry = recruitmentEntry(href)
  return (
    <Navigate
      to="/login"
      search={{ redirect: entry ? recruitmentEntryPath(entry) : undefined }}
      replace
    />
  )
}
