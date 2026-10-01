import { useCallback, useEffect, useState } from 'react'
import * as googlePhotos from '../api/googlePhotos'
import type { DriveFile, LocalDriveAccount } from '../types'
import { takenAt } from '../utils/photoLayout'
import { fileKey } from './usePagedDriveFiles'

// Google Photos base URLs stop working after 60 minutes; refresh them a little before that.
const REFRESH_MS = 50 * 60_000

/** AllDrive-uploaded + user-picked Google Photos items from every account, newest first. */
export const useGooglePhotos = (drives: LocalDriveAccount[], reloadKey: unknown) => {
  const [files, setFiles] = useState<DriveFile[]>([])
  // Only the first load shows the skeleton; refreshes keep the current grid until new data arrives.
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let live = true
    Promise.allSettled(
      drives.flatMap((d) => [googlePhotos.listAppCreated(d), googlePhotos.listPicked(d)])
    ).then((results) => {
      if (!live) return
      const seen = new Set<string>()
      const all = results
        .flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
        .filter((f) => !seen.has(fileKey(f)) && seen.add(fileKey(f)))
        .sort((a, b) => takenAt(b).localeCompare(takenAt(a)))
      const failure = results.find((r): r is PromiseRejectedResult => r.status === 'rejected')
      const res = failure?.reason?.response
      const detail: string = res?.data?.error?.message ?? failure?.reason?.message ?? ''
      setError(
        !failure
          ? ''
          : /not been used|disabled|not activated/i.test(detail)
            ? 'Enable the Photos Library API and Google Photos Picker API in Google Cloud Console, then reload.'
            : res?.status === 401 || res?.status === 403
              ? 'Some accounts haven’t allowed Google Photos access yet. Reconnect them from Drives.'
              : `Some Google Photos failed to load: ${detail}`
      )
      setFiles(all)
      setLoading(false)
    })
    const timer = setTimeout(() => setTick((t) => t + 1), REFRESH_MS)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [drives, reloadKey, tick])

  const [picking, setPicking] = useState(false)
  const pick = useCallback(async (drive: LocalDriveAccount) => {
    setPicking(true)
    try {
      await googlePhotos.pickFromGooglePhotos(drive)
      setTick((t) => t + 1)
    } catch (err) {
      const detail = (err as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message
      setError(`Couldn’t open Google Photos: ${detail ?? (err as Error).message}`)
    } finally {
      setPicking(false)
    }
  }, [])

  return { files, loading, error, picking, pick }
}
