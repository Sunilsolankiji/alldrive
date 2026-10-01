import { useMemo, useState } from 'react'
import type { DriveFile, LocalDriveAccount } from '../types'
import { fileKey, usePagedDriveFiles } from '../hooks/usePagedDriveFiles'
import LoadMoreSentinel from './LoadMoreSentinel'
import FileGrid from './FileGrid'
import { FOLDER_MIME } from './FileCard'

interface Props {
  drives: LocalDriveAccount[]
  search: string
  typeFilter?: (mimeType: string) => boolean
  hidden: Set<string>
  reloadKey: number
  onPreview: (file: DriveFile) => void
  onDelete: (file: DriveFile) => void
}

const MEDIA = /^(image|video)\//
const isFolder = (f: DriveFile) => f.mimeType === FOLDER_MIME
const foldersFirst = (a: DriveFile, b: DriveFile) =>
  Number(isFolder(b)) - Number(isFolder(a)) || a.name.localeCompare(b.name)

const FilesView = ({ drives, search, typeFilter, hidden, reloadKey, onPreview, onDelete }: Props) => {
  const [folderPath, setFolderPath] = useState<DriveFile[]>([])
  const currentFolder = folderPath[folderPath.length - 1]

  // Inside a folder, only its own drive can have children
  const targetDrives = useMemo(
    () => (currentFolder ? drives.filter((d) => d.id === currentFolder.driveAccountId) : drives),
    [drives, currentFolder]
  )
  // Photos/videos are filtered client-side: Drive rejects some `not mimeType contains` queries
  const q = `'${currentFolder?.id ?? 'root'}' in parents`
  const { files, loading, error, hasMore, loadMore } = usePagedDriveFiles(
    targetDrives, q, 'folder,name', foldersFirst, reloadKey
  )

  const query = search.trim().toLowerCase()
  const visible = files.filter(
    (f) =>
      !MEDIA.test(f.mimeType) &&
      !hidden.has(fileKey(f)) &&
      (!query || f.name.toLowerCase().includes(query)) &&
      (!typeFilter || typeFilter(f.mimeType))
  )

  return (
    <div>
      <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap items-center gap-1 text-sm">
        {[null, ...folderPath].map((folder, i) => {
          const label = folder ? folder.name : 'My Drive'
          return (
            <span key={folder?.id ?? 'root'} className="flex items-center gap-1">
              {i > 0 && <span className="text-gray-400">/</span>}
              {i === folderPath.length ? (
                <span className="font-semibold text-gray-900" aria-current="page">{label}</span>
              ) : (
                <button onClick={() => setFolderPath(folderPath.slice(0, i))} className="text-blue-600 hover:underline">
                  {label}
                </button>
              )}
            </span>
          )
        })}
      </nav>

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {loading && !files.length ? (
        <FileGrid.Skeleton />
      ) : (
        <>
          {visible.length > 0 && (
            <FileGrid
              files={visible}
              onPreview={onPreview}
              onDelete={onDelete}
              onOpenFolder={(f) => setFolderPath((p) => [...p, f])}
            />
          )}
          {hasMore ? (
            <LoadMoreSentinel onVisible={loadMore} />
          ) : (
            !visible.length && (
              <div className="flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-white text-center">
                <p className="mb-3 text-5xl">📂</p>
                <h3 className="text-lg font-semibold text-gray-900">No files here</h3>
                <p className="text-gray-500">Try a different search or file type, or upload a file.</p>
              </div>
            )
          )}
        </>
      )}
    </div>
  )
}

export default FilesView
