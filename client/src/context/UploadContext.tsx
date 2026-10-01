import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import * as localDriveApi from '../api/localDrive'
import type { LocalDriveAccount } from '../types'

export type UploadStatus = 'pending' | 'uploading' | 'done' | 'failed' | 'canceled'

export interface UploadItem {
  id: number
  name: string
  size: number
  /** True when the file goes to Google Photos rather than Drive. */
  toPhotos: boolean
  accountEmail: string
  status: UploadStatus
  /** Percentage of this file transferred, 0-100. */
  pct: number
  error: string
  startedAt?: number
  finishedAt?: number
}

interface UploadContextType {
  items: UploadItem[]
  /** Increments whenever a file finishes, so views can refresh their listings. */
  completed: number
  enqueue: (drive: LocalDriveAccount, files: File[]) => void
  retry: (id: number) => void
  cancel: (id: number) => void
  /** Cancels everything still pending or uploading. */
  cancelAll: () => void
  clearFinished: () => void
}

const UploadContext = createContext<UploadContextType | null>(null)

/** How long a finished upload stays on screen before it clears itself. */
const AUTO_CLEAR_MS = 5000

/** Queue entry; the File and drive stay out of UploadItem so renders don't hold onto them. */
interface Job {
  file: File
  drive: LocalDriveAccount
}

export const UploadProvider = ({ children }: { children: ReactNode }) => {
  const [items, setItems] = useState<UploadItem[]>([])
  const [completed, setCompleted] = useState(0)
  // The runner reads these synchronously; state is only the render mirror.
  const itemsRef = useRef<UploadItem[]>([])
  const jobs = useRef(new Map<number, Job>())
  const aborters = useRef(new Map<number, AbortController>())
  const running = useRef(false)
  const nextId = useRef(0)

  const write = (next: UploadItem[]) => {
    itemsRef.current = next
    setItems(next)
  }
  const patch = (id: number, fields: Partial<UploadItem>) =>
    write(itemsRef.current.map((i) => (i.id === id ? { ...i, ...fields } : i)))

  /** Successful uploads tidy themselves away; failures and cancels stay so they can be retried. */
  const scheduleAutoClear = (id: number) => {
    setTimeout(() => {
      if (itemsRef.current.find((i) => i.id === id)?.status !== 'done') return
      write(itemsRef.current.filter((i) => i.id !== id))
    }, AUTO_CLEAR_MS)
  }

  const run = useCallback(async () => {
    if (running.current) return
    running.current = true
    try {
      for (;;) {
        const next = itemsRef.current.find((i) => i.status === 'pending')
        const job = next && jobs.current.get(next.id)
        if (!next || !job) break
        patch(next.id, { status: 'uploading', pct: 0, error: '', startedAt: Date.now() })
        const ac = new AbortController()
        aborters.current.set(next.id, ac)
        try {
          const onPct = (pct: number) => patch(next.id, { pct })
          if (next.toPhotos) await localDriveApi.uploadToPhotos(job.drive, job.file, onPct, ac.signal)
          else await localDriveApi.uploadFile(job.drive, job.file, onPct, ac.signal)
          patch(next.id, { status: 'done', pct: 100, finishedAt: Date.now() })
          jobs.current.delete(next.id) // release the File once it can't be retried
          scheduleAutoClear(next.id)
          setCompleted((c) => c + 1)
        } catch (err) {
          // An aborted request isn't a failure; cancel() already set the status.
          if (ac.signal.aborted) patch(next.id, { finishedAt: Date.now() })
          else patch(next.id, { status: 'failed', error: localDriveApi.uploadErrorMessage(err), finishedAt: Date.now() })
        } finally {
          aborters.current.delete(next.id)
        }
      }
    } finally {
      running.current = false
    }
  }, [])

  const enqueue = useCallback(
    (drive: LocalDriveAccount, files: File[]) => {
      const added = files.map((file) => {
        const id = nextId.current++
        jobs.current.set(id, { file, drive })
        return {
          id,
          name: file.name,
          size: file.size,
          toPhotos: localDriveApi.isPhotosMedia(file),
          accountEmail: drive.accountEmail,
          status: 'pending' as const,
          pct: 0,
          error: '',
        }
      })
      write([...itemsRef.current, ...added])
      void run()
    },
    [run]
  )

  const retry = useCallback(
    (id: number) => {
      if (!jobs.current.has(id)) return
      patch(id, { status: 'pending', pct: 0, error: '', startedAt: undefined, finishedAt: undefined })
      void run()
    },
    [run]
  )

  const cancel = useCallback((id: number) => {
    const item = itemsRef.current.find((i) => i.id === id)
    if (!item || (item.status !== 'pending' && item.status !== 'uploading')) return
    patch(id, { status: 'canceled', error: '', finishedAt: Date.now() })
    aborters.current.get(id)?.abort()
  }, [])

  const cancelAll = useCallback(() => {
    for (const i of itemsRef.current) if (i.status === 'pending' || i.status === 'uploading') cancel(i.id)
  }, [cancel])

  const clearFinished = useCallback(() => {
    const kept = itemsRef.current.filter((i) => i.status === 'pending' || i.status === 'uploading')
    for (const i of itemsRef.current) if (!kept.includes(i)) jobs.current.delete(i.id)
    write(kept)
  }, [])

  return (
    <UploadContext.Provider value={{ items, completed, enqueue, retry, cancel, cancelAll, clearFinished }}>
      {children}
    </UploadContext.Provider>
  )
}

export const useUploads = () => {
  const ctx = useContext(UploadContext)
  if (!ctx) throw new Error('useUploads must be used within UploadProvider')
  return ctx
}
