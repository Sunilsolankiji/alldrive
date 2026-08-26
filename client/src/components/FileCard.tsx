import { useState } from 'react'
import type { DriveFile } from '../types'
import { getDownloadUrl } from '../api/files'

interface Props {
  file: DriveFile
  onPreview: (file: DriveFile) => void
  onDelete: (file: DriveFile) => void
}

const getMimeIcon = (mimeType: string) => {
  if (mimeType.startsWith('image/')) return '🖼️'
  if (mimeType.startsWith('video/')) return '🎬'
  if (mimeType.startsWith('audio/')) return '🎵'
  if (mimeType === 'application/pdf') return '📄'
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return '📊'
  if (mimeType.includes('document') || mimeType.includes('word')) return '📝'
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return '📊'
  if (mimeType === 'application/zip' || mimeType.includes('compressed')) return '🗜️'
  return '📁'
}

const formatSize = (size?: string) => {
  if (!size) return ''
  const bytes = parseInt(size)
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const isPreviewable = (mimeType: string) =>
  mimeType.startsWith('image/') ||
  mimeType.startsWith('video/') ||
  mimeType === 'application/pdf'

const FileCard = ({ file, onPreview, onDelete }: Props) => {
  const [menuOpen, setMenuOpen] = useState(false)
  const isImage = file.mimeType.startsWith('image/')
  const canPreview = isPreviewable(file.mimeType)

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg">
      {/* Thumbnail */}
      <div
        className={`relative aspect-square overflow-hidden bg-gray-100 ${canPreview ? 'cursor-pointer' : 'cursor-default'}`}
        onClick={() => canPreview && onPreview(file)}
      >
        {isImage && file.thumbnailLink ? (
          <img
            src={file.thumbnailLink}
            alt={file.name}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            loading="lazy"
          />
        ) : (
          <span className="text-5xl">{getMimeIcon(file.mimeType)}</span>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/25 to-transparent" />
      </div>

      {/* Info */}
      <div className="space-y-1.5 p-3.5">
        <p className="truncate text-sm font-semibold text-gray-900" title={file.name}>
          {file.name}
        </p>
        <div className="flex items-center justify-between gap-3">
          <span className="rounded bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">
            {formatSize(file.size) || 'File'}
          </span>
          <span className="max-w-[110px] truncate text-xs text-gray-500" title={file.driveEmail}>
            {file.driveName || file.driveEmail}
          </span>
        </div>
      </div>

      {/* Menu button */}
      <div className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100">
        <div className="relative">
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen) }}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-gray-600 shadow-md hover:bg-gray-50"
          >
            ⋮
          </button>
          {menuOpen && (
            <div
              className="absolute right-0 top-9 z-10 min-w-[150px] rounded-xl border border-gray-200 bg-white py-1 shadow-lg"
              onMouseLeave={() => setMenuOpen(false)}
            >
              {canPreview && (
                <button
                  onClick={() => { onPreview(file); setMenuOpen(false) }}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                >
                  👁 Preview
                </button>
              )}
              <a
                href={getDownloadUrl(file.driveAccountId, file.id)}
                target="_blank"
                rel="noreferrer"
                className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                onClick={() => setMenuOpen(false)}
              >
                ⬇ Download
              </a>
              {file.webViewLink && (
                <a
                  href={file.webViewLink}
                  target="_blank"
                  rel="noreferrer"
                  className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  onClick={() => setMenuOpen(false)}
                >
                  🔗 Open in Drive
                </a>
              )}
              <button
                onClick={() => { onDelete(file); setMenuOpen(false) }}
                className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
              >
                🗑 Delete
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default FileCard
