import type { DriveFile } from '../types'
import { getDownloadUrl, getPreviewUrl } from '../api/files'

interface Props {
  file: DriveFile
  onClose: () => void
  overridePreviewUrl?: string  // used in local mode — direct google URL with token
  loading?: boolean
  onDelete?: (file: DriveFile) => void
}

const FilePreviewModal = ({ file, onClose, overridePreviewUrl, loading, onDelete }: Props) => {
  const previewUrl = overridePreviewUrl ?? getPreviewUrl(file.driveAccountId, file.id)
  const downloadUrl = getDownloadUrl(file.driveAccountId, file.id)

  const renderPreview = () => {
    if (loading)
      return (
        <div className="flex flex-col items-center gap-3 text-white" role="status">
          <span className="h-10 w-10 animate-spin rounded-full border-4 border-white/30 border-t-white" />
          <span className="text-sm text-gray-300">Loading…</span>
        </div>
      )
    if (file.mimeType.startsWith('image/'))
      return <img src={previewUrl} alt={file.name} className="max-w-full max-h-full object-contain" />
    if (file.mimeType.startsWith('video/'))
      return <video src={previewUrl} controls className="max-w-full max-h-full" />
    if (file.mimeType === 'application/pdf')
      return <iframe src={previewUrl} title={file.name} className="w-full h-full border-0" />
    return (
      <div className="flex flex-col items-center justify-center gap-4 text-white">
        <span className="text-6xl">📁</span>
        <p className="text-lg">{file.name}</p>
        <p className="text-sm text-gray-300">Preview not available for this file type</p>
      </div>
    )
  }

  return (
    <div
      className="fixed inset-0 bg-black/80 flex flex-col z-50"
      onClick={onClose}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-6 py-4 bg-black/40"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-white font-medium truncate">{file.name}</span>
          <span className="text-gray-400 text-sm shrink-0">{file.driveEmail}</span>
        </div>
        <div className="flex items-center gap-2 ml-4">
          <a
            href={downloadUrl}
            target="_blank"
            rel="noreferrer"
            className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-sm rounded-lg transition-colors"
          >
            ⬇ Download
          </a>
          {onDelete && (
            <button
              onClick={() => onDelete(file)}
              className="px-3 py-1.5 bg-white/10 hover:bg-red-500/80 text-white text-sm rounded-lg transition-colors"
            >
              🗑 Delete
            </button>
          )}
          <button
            onClick={onClose}
            className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-sm rounded-lg transition-colors"
          >
            ✕ Close
          </button>
        </div>
      </div>

      {/* Preview area */}
      <div
        className="flex-1 flex items-center justify-center overflow-hidden p-4"
        onClick={(e) => e.stopPropagation()}
      >
        {renderPreview()}
      </div>
    </div>
  )
}

export default FilePreviewModal
