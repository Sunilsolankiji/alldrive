import { useRef, useState, type DragEvent } from 'react'
import type { LocalDriveAccount } from '../types'
import * as localDriveApi from '../api/localDrive'
import { username } from '../utils/username'

interface Props {
  drives: LocalDriveAccount[]
  onClose: () => void
  /** Hands the files to the page, which uploads them in the background. */
  onUpload: (drive: LocalDriveAccount, files: File[]) => void
}

const LocalUploadModal = ({ drives, onClose, onUpload }: Props) => {
  const [selectedId, setSelectedId] = useState(drives[0]?.id || '')
  const [files, setFiles] = useState<File[]>([])
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  const [needsReconnect, setNeedsReconnect] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const askReconnect = () => {
    setNeedsReconnect(true)
    setError('This account hasn’t allowed uploads to Google Photos yet. Reconnect it and tick the Google Photos permission.')
  }

  const handleUpload = async () => {
    if (!files.length || !selectedId) return
    const drive = drives.find((d) => d.id === selectedId)
    if (!drive) return
    // Checked before handing off, so the reconnect prompt stays in the dialog that can act on it.
    setChecking(true)
    const allowed = !files.some(localDriveApi.isPhotosMedia) || (await localDriveApi.hasPhotosScope(drive).catch(() => false))
    setChecking(false)
    if (!allowed) return askReconnect()
    onUpload(drive, files)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Upload Files</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Upload to</label>
            <select
              value={selectedId}
              onChange={(e) => { setSelectedId(e.target.value); setError(''); setNeedsReconnect(false) }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {drives.map((d) => (
                <option key={d.id} value={d.id}>{username(d.accountEmail)}</option>
              ))}
            </select>
          </div>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e: DragEvent) => { e.preventDefault(); setDragging(false); setFiles(Array.from(e.dataTransfer.files)) }}
            onClick={() => inputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
              dragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
            }`}
          >
            <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => setFiles(Array.from(e.target.files || []))} />
            <p className="text-2xl mb-2">folder</p>
            <p className="text-sm text-gray-600">
              {files.length > 0 ? `${files.length} file${files.length > 1 ? 's' : ''} selected` : 'Drag and drop files here, or click to browse'}
            </p>
            <p className="mt-1 text-xs text-gray-500">Photos &amp; videos go to Google Photos; other files go to Google Drive.</p>
          </div>
          {error && (
            <div className="text-sm text-red-600">
              <p>{error}</p>
              {needsReconnect && (
                <button
                  type="button"
                  onClick={() => localDriveApi.startGoogleConnect(drives.find((d) => d.id === selectedId)?.accountEmail, true)}
                  className="mt-2 rounded-lg bg-red-600 px-3 py-1.5 font-medium text-white hover:bg-red-700"
                >
                  Reconnect {username(drives.find((d) => d.id === selectedId)?.accountEmail ?? '')}
                </button>
              )}
            </div>
          )}
        </div>
        <div className="flex gap-3 p-6 pt-0">
          <button onClick={onClose} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">Cancel</button>
          <button onClick={handleUpload} disabled={!files.length || !selectedId || checking} className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
            {checking ? 'Starting...' : 'Upload'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default LocalUploadModal
