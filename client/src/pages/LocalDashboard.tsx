import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLocalDrives } from '../context/LocalDriveContext'
import * as localDriveApi from '../api/localDrive'
import DriveChip from '../components/DriveChip'
import FileGrid from '../components/FileGrid'
import FilePreviewModal from '../components/FilePreviewModal'
import Navbar from '../components/Navbar'
import LocalUploadModal from '../components/LocalUploadModal'
import type { DriveAccount, DriveFile, LocalDriveAccount } from '../types'

const toDisplayDrive = (d: LocalDriveAccount): DriveAccount => ({
  _id: d.id,
  accountEmail: d.accountEmail,
  accountName: d.accountName,
  profilePicture: d.profilePicture,
  createdAt: '',
})

const LocalDashboard = () => {
  const { drives } = useLocalDrives()
  const [files, setFiles] = useState<DriveFile[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDriveId, setSelectedDriveId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [showUpload, setShowUpload] = useState(false)
  const [previewFile, setPreviewFile] = useState<DriveFile | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [error, setError] = useState('')

  const displayDrives = useMemo(() => drives.map(toDisplayDrive), [drives])

  const fetchFiles = async () => {
    setLoading(true)
    setError('')
    try {
      const targetDrives = selectedDriveId
        ? drives.filter((d) => d.id === selectedDriveId)
        : drives

      const results = await Promise.allSettled(
        targetDrives.map((d) => localDriveApi.listFiles(d))
      )
      const all: DriveFile[] = []
      for (const r of results) {
        if (r.status === 'fulfilled') all.push(...r.value)
      }
      all.sort((a, b) => new Date(b.modifiedTime).getTime() - new Date(a.modifiedTime).getTime())
      setFiles(all)
    } catch {
      setError('Failed to load files.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void fetchFiles() }, [selectedDriveId, drives])

  const handleDelete = async (file: DriveFile) => {
    if (!confirm(`Delete "${file.name}"?`)) return
    const drive = drives.find((d) => d.id === file.driveAccountId)
    if (!drive) return
    try {
      await localDriveApi.deleteFile(drive, file.id)
      setFiles((prev) => prev.filter((f) => !(f.id === file.id && f.driveAccountId === file.driveAccountId)))
    } catch {
      alert('Failed to delete file.')
    }
  }

  const handlePreview = (file: DriveFile) => {
    const drive = drives.find((d) => d.id === file.driveAccountId)
    if (!drive) return
    setPreviewUrl(localDriveApi.getFileUrl(drive, file.id))
    setPreviewFile(file)
  }

  const filteredFiles = search.trim()
    ? files.filter((f) => f.name.toLowerCase().includes(search.toLowerCase()))
    : files

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-gray-100">
      <Navbar />
      <div className="mx-auto max-w-screen-2xl px-4 py-6 sm:px-6">
        <div className="mb-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-bold text-gray-900">All Files</h2>
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Local Mode</span>
              </div>
              <p className="mt-0.5 text-sm text-gray-500">{filteredFiles.length} items</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                type="text"
                placeholder="Search files..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 sm:w-60"
              />
              <button
                onClick={() => setShowUpload(true)}
                disabled={!drives.length}
                className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Upload
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        {displayDrives.length > 0 && (
          <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm sm:p-4">
            <DriveChip drives={displayDrives} selectedDriveId={selectedDriveId} onSelect={setSelectedDriveId} />
          </div>
        )}

        {loading ? (
          <FileGrid.Skeleton />
        ) : filteredFiles.length === 0 ? (
          <div className="flex min-h-[420px] flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-white py-20 text-center">
            {drives.length === 0 ? (
              <>
                <p className="text-4xl mb-4">cloud</p>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No drives connected</h3>
                <p className="text-gray-500 mb-6">Connect a Google Drive account to see your files here.</p>
                <Link to="/drives" className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg font-medium transition-colors">
                  Connect Drive
                </Link>
              </>
            ) : (
              <>
                <p className="text-4xl mb-4">empty</p>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No files found</h3>
                <p className="text-gray-500">Try a different search or upload a file.</p>
              </>
            )}
          </div>
        ) : (
          <FileGrid files={filteredFiles} onPreview={handlePreview} onDelete={handleDelete} />
        )}
      </div>

      {showUpload && (
        <LocalUploadModal drives={drives} onClose={() => setShowUpload(false)} onUploaded={fetchFiles} />
      )}
      {previewFile && previewUrl && (
        <FilePreviewModal
          file={previewFile}
          onClose={() => { setPreviewFile(null); setPreviewUrl(null) }}
          overridePreviewUrl={previewUrl}
        />
      )}
    </div>
  )
}

export default LocalDashboard
