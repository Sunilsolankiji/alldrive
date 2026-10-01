import type { DriveFile } from '../types'
import FileCard from './FileCard'

interface Props {
  files: DriveFile[]
  onPreview: (file: DriveFile) => void
  onDelete: (file: DriveFile) => void
  onOpenFolder?: (file: DriveFile) => void
}

const SkeletonCard = () => (
  <div className="animate-pulse overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
    <div className="aspect-square bg-gray-200" />
    <div className="space-y-2 p-3">
      <div className="h-3 w-3/4 rounded bg-gray-200" />
      <div className="h-3 w-1/2 rounded bg-gray-200" />
    </div>
  </div>
)

const FileGrid = ({ files, onPreview, onDelete, onOpenFolder }: Props) => (
  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
    {files.map((file) => (
      <FileCard key={`${file.driveAccountId}-${file.id}`} file={file} onPreview={onPreview} onDelete={onDelete} onOpenFolder={onOpenFolder} />
    ))}
  </div>
)

FileGrid.Skeleton = ({ count = 12 }: { count?: number }) => (
  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
    {Array.from({ length: count }).map((_, i) => <SkeletonCard key={i} />)}
  </div>
)

export default FileGrid
