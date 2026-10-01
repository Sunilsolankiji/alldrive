import { useState } from 'react'
import { Link } from 'react-router-dom'
import Navbar from '../components/Navbar'
import LocalUploadModal from '../components/LocalUploadModal'
import { useLocalDrives } from '../context/LocalDriveContext'
import { useUploads, type UploadItem } from '../context/UploadContext'
import { formatSize } from '../utils/photoLayout'
import { uploadSummary } from '../utils/uploadStatus'
import { username } from '../utils/username'

const STATUS: Record<UploadItem['status'], { label: string; className: string }> = {
  pending: { label: 'Queued', className: 'bg-gray-100 text-gray-600' },
  uploading: { label: 'Uploading', className: 'bg-blue-50 text-blue-700' },
  done: { label: 'Uploaded', className: 'bg-emerald-50 text-emerald-700' },
  failed: { label: 'Failed', className: 'bg-red-50 text-red-700' },
  canceled: { label: 'Canceled', className: 'bg-amber-50 text-amber-700' },
}

const duration = (item: UploadItem) => {
  if (!item.startedAt || !item.finishedAt) return ''
  const s = (item.finishedAt - item.startedAt) / 1000
  return s < 60 ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`
}

const Uploads = () => {
  const { items, enqueue, retry, cancel, cancelAll, clearFinished } = useUploads()
  const { drives } = useLocalDrives()
  const [showUpload, setShowUpload] = useState(false)
  const summary = uploadSummary(items)
  const finished = summary.done + summary.failed + summary.canceled

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-gray-100">
      <Navbar />
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Uploads</h2>
              <p className="mt-0.5 text-sm text-gray-500">
                {items.length ? summary.label : 'Nothing uploading right now'}
              </p>
            </div>
            <div className="flex shrink-0 gap-2 self-start">
              <button
                onClick={() => setShowUpload(true)}
                disabled={!drives.length}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
              >
                Upload
              </button>
              {summary.busy && (
                <button
                  onClick={cancelAll}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                >
                  Cancel all
                </button>
              )}
              {finished > 0 && (
                <button
                  onClick={clearFinished}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                >
                  Clear finished
                </button>
              )}
            </div>
          </div>
          {summary.busy && (
            <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
              <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${summary.percent}%` }} />
            </div>
          )}
        </div>

        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-12 text-center shadow-sm">
            <p className="mb-4 text-4xl">☁️</p>
            <h3 className="mb-2 text-lg font-semibold text-gray-900">No uploads yet</h3>
            <p className="mb-6 text-sm text-gray-500">
              Uploads keep running here while you browse. Finished ones clear themselves, and everything is
              lost if you reload the page.
            </p>
            {drives.length ? (
              <button
                onClick={() => setShowUpload(true)}
                className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
              >
                Upload files
              </button>
            ) : (
              <Link to="/drives" className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700">
                Connect a drive
              </Link>
            )}
          </div>
        ) : (
          <ul className="space-y-3">
            {items.map((item) => {
              const status = STATUS[item.status]
              return (
                <li key={item.id} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-gray-900" title={item.name}>{item.name}</p>
                      <p className="mt-0.5 truncate text-xs text-gray-500" title={item.accountEmail}>
                        {formatSize(String(item.size))} · {item.toPhotos ? 'Google Photos' : 'Google Drive'} ·{' '}
                        {username(item.accountEmail)}
                        {duration(item) && ` · ${duration(item)}`}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${status.className}`}>
                        {item.status === 'uploading' ? `${item.pct}%` : status.label}
                      </span>
                      {(item.status === 'pending' || item.status === 'uploading') && (
                        <button
                          onClick={() => cancel(item.id)}
                          className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>

                  {item.status === 'uploading' && (
                    <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
                      <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${item.pct}%` }} />
                    </div>
                  )}

                  {(item.status === 'failed' || item.status === 'canceled') && (
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-xs text-red-600">{item.error}</p>
                      <button
                        onClick={() => retry(item.id)}
                        className="shrink-0 self-start rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
                      >
                        Retry
                      </button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {showUpload && (
        <LocalUploadModal drives={drives} onClose={() => setShowUpload(false)} onUpload={enqueue} />
      )}
    </div>
  )
}

export default Uploads
