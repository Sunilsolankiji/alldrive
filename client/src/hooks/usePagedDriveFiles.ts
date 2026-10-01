import { useEffect, useRef, useState } from 'react'
import * as localDriveApi from '../api/localDrive'
import type { DriveFile, LocalDriveAccount } from '../types'
import { visibleUpToFrontier } from '../utils/mergePages'

type Cursor = { drive: LocalDriveAccount; token?: string; last?: DriveFile }
type Compare = (a: DriveFile, b: DriveFile) => number

export const fileKey = (f: DriveFile) => `${f.driveAccountId}:${f.id}`

/**
 * Pages through several drives at once and merges them into one sorted list.
 * `compare` must match `orderBy`, and both must be stable references.
 */
export const usePagedDriveFiles = (
  drives: LocalDriveAccount[],
  q: string,
  orderBy: string,
  compare: Compare,
  reloadKey: unknown
) => {
  const [all, setAll] = useState<DriveFile[]>([])
  const [cursors, setCursors] = useState<Cursor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const busy = useRef(false)
  const generation = useRef(0)

  const load = async (targets: Cursor[], reset: boolean) => {
    const gen = reset ? ++generation.current : generation.current
    busy.current = true
    setLoading(true)
    if (reset) {
      setAll([])
      setCursors([])
      setError('')
    }

    const results = await Promise.allSettled(
      targets.map((c) => localDriveApi.listFiles(c.drive, { q, orderBy, pageToken: c.token }))
    )
    if (gen !== generation.current) return // a newer reset superseded this request

    const added: DriveFile[] = []
    const next: Cursor[] = []
    results.forEach((r, i) => {
      if (r.status !== 'fulfilled') return
      const { files, nextPageToken } = r.value
      added.push(...files)
      if (nextPageToken) next.push({ drive: targets[i].drive, token: nextPageToken, last: files[files.length - 1] })
    })
    const failure = results.find((r): r is PromiseRejectedResult => r.status === 'rejected')
    if (failure) {
      const detail = failure.reason?.response?.data?.error?.message ?? failure.reason?.message
      setError(`Some drives failed to load${detail ? `: ${detail}` : ''}. If your session expired, reconnect the drive.`)
    }

    setAll((prev) => (reset ? added : [...prev, ...added]).sort(compare))
    setCursors(next)
    busy.current = false
    setLoading(false)
  }

  useEffect(() => {
    void load(drives.map((drive) => ({ drive })), true)
  }, [drives, q, orderBy, reloadKey])

  const loadMore = () => {
    if (!busy.current && cursors.length) void load(cursors, false)
  }

  const files = visibleUpToFrontier(all, cursors.map((c) => c.last), compare)

  return { files, loading, error, hasMore: cursors.length > 0, loadMore }
}
