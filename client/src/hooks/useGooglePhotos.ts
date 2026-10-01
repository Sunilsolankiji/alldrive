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
  /** Accounts whose token lacks the Photos scopes; they need the consent screen again. */
  const [needsAccess, setNeedsAccess] = useState<LocalDriveAccount[]>([])
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let live = true
    const calls = drives.flatMap((d) => [googlePhotos.listAppCreated(d), googlePhotos.listPicked(d)])
    Promise.allSettled(calls).then((results) => {
      if (!live) return
      const seen = new Set<string>()
      const all = results
        .flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
        .filter((f) => !seen.has(fileKey(f)) && seen.add(fileKey(f)))
        .sort((a, b) => takenAt(b).localeCompare(takenAt(a)))
      const failures = results.flatMap((r, i) =>
        r.status === 'rejected'
          ? [{ drive: drives[Math.floor(i / 2)], status: r.reason?.response?.status as number | undefined,
               detail: String(r.reason?.response?.data?.error?.message ?? r.reason?.message ?? '') }]
          : []
      )
      const apiOff = failures.find((f) => /not been used|disabled|not activated/i.test(f.detail))
      // 401 = dead token: LocalDriveContext marks the drive expired and the reconnect banner takes over.
      const denied = failures.filter((f) => !apiOff && f.status === 403)
      const other = failures.find((f) => !apiOff && f.status !== 401 && !denied.includes(f))
      setNeedsAccess([...new Set(denied.map((f) => f.drive))])
      setError(
        apiOff
          ? 'Enable the Photos Library API and Google Photos Picker API in Google Cloud Console, then reload.'
          : other
            ? `Some Google Photos failed to load: ${other.detail}`
            : ''
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
      const res = (err as { response?: { status?: number; data?: { error?: { message?: string } } } }).response
      setError(
        res?.status === 401
          ? 'This account’s Google session has ended. Reconnect it from the banner above, then try again.'
          : `Couldn’t open Google Photos: ${res?.data?.error?.message ?? (err as Error).message}`
      )
    } finally {
      setPicking(false)
    }
  }, [])

  return { files, loading, error, needsAccess, picking, pick }
}
