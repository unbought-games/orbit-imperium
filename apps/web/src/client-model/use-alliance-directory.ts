import { useEffect, useState } from 'react'
import { useStore } from 'zustand'
import { readRecruitmentDirectory } from '../adapters/alliances'
import type { Coordinator } from './coordinator'
import {
  AllianceDirectoryController,
  recruitmentSearch,
  type AllianceSearch,
} from './alliance-directory'
export function useAllianceDirectory(
  universe: string,
  query: AllianceSearch,
  model?: Coordinator,
) {
  const [controller] = useState(
    () =>
      new AllianceDirectoryController(async (search, signal) => {
        if (model) {
          const data = await model.allianceQuery({
            type: 'Directory',
            search: search.search,
            offset: search.offset,
            recruiting_only: !search.all,
            language: search.language || null,
            beginners: search.beginners || null,
            activity: search.activity || null,
          })
          if (!data)
            throw new Error('Alliance directory unavailable. Please try again.')
          return { kind: 'all', data }
        }
        return {
          kind: 'recruiting',
          data: await readRecruitmentDirectory(
            universe,
            recruitmentSearch(search),
            signal,
          ),
        }
      }),
  )
  useEffect(() => {
    void controller.load(query)
    return () => controller.cancel()
  }, [controller, query])
  return {
    ...useStore(controller.store),
    retry: () => void controller.load(query),
  }
}
