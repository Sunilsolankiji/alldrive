import { Link, useLocation } from 'react-router-dom'
import { useUploads } from '../context/UploadContext'
import { uploadSummary } from '../utils/uploadStatus'

/** Floating progress card for background uploads. Hidden on the uploads page itself. */
const UploadIndicator = () => {
  const { items } = useUploads()
  const { pathname } = useLocation()
  const summary = uploadSummary(items)

  if (!items.length || pathname === '/uploads') return null

  return (
    <Link
      to="/uploads"
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-4 z-40 block w-72 rounded-2xl border border-gray-200 bg-white p-4 shadow-xl transition-shadow hover:shadow-2xl"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="truncate text-sm font-medium text-gray-900">{summary.label}</p>
        <span className="shrink-0 text-xs font-medium text-blue-600">Details</span>
      </div>
      {summary.busy && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
          <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${summary.percent}%` }} />
        </div>
      )}
      {!summary.busy && summary.failed > 0 && (
        <p className="mt-1 text-xs text-red-600">Tap to see what went wrong</p>
      )}
    </Link>
  )
}

export default UploadIndicator
