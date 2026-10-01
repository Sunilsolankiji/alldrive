import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useLocalDrives } from '../context/LocalDriveContext'
import * as localDriveApi from '../api/localDrive'
import ConfirmDialog from '../components/ConfirmDialog'
import DriveChip from '../components/DriveChip'
import { FOLDER_MIME } from '../components/FileCard'
import FilePreviewModal from '../components/FilePreviewModal'
import FilesView from '../components/FilesView'
import Navbar from '../components/Navbar'
import LocalUploadModal from '../components/LocalUploadModal'
import PhotosView from '../components/PhotosView'
import { fileKey } from '../hooks/usePagedDriveFiles'
import type { DriveAccount, DriveFile, LocalDriveAccount } from '../types'
import { username } from '../utils/username'

const toDisplayDrive = (d: LocalDriveAccount): DriveAccount => ({
  _id: d.id,
  accountEmail: d.accountEmail,
  accountName: d.accountName,
  profilePicture: d.profilePicture,
  createdAt: '',
})

type Tab = 'photos' | 'files'
type TypeFilters = Record<string, (m: string) => boolean>

const TYPE_FILTERS: Record<Tab, TypeFilters> = {
  photos: {
    Photos: (m) => m.startsWith('image/'),
    Videos: (m) => m.startsWith('video/'),
  },
  files: {
    Folders: (m) => m === FOLDER_MIME,
    Audio: (m) => m.startsWith('audio/'),
    PDFs: (m) => m === 'application/pdf',
    Documents: (m) => m.includes('document') || m.includes('word') || m.startsWith('text/'),
    Spreadsheets: (m) => m.includes('spreadsheet') || m.includes('excel'),
    Presentations: (m) => m.includes('presentation') || m.includes('powerpoint'),
    Archives: (m) => m === 'application/zip' || m.includes('compressed'),
  },
}

const PhotosIcon = () => (
  <svg width="1.375em" height="1.375em" viewBox="0 0 24 24" className="shrink-0" aria-hidden="true">
    <path
      d="M22,16V4A2,2 0 0,0 20,2H8A2,2 0 0,0 6,4V16A2,2 0 0,0 8,18H20A2,2 0 0,0 22,16M11,12L13.03,14.71L16,11L20,16H8M2,6V20A2,2 0 0,0 4,22H18V20H4V6"
      fill="currentColor"
    />
  </svg>
)

const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  { id: 'photos', label: 'Photos', icon: <PhotosIcon /> },
  { id: 'files', label: 'Files', icon: <span aria-hidden="true">📂</span> },
]

const LocalDashboard = () => {
  const { drives } = useLocalDrives()
  const [tab, setTab] = useState<Tab>('photos')
  const [selectedDriveId, setSelectedDriveId] = useState<string | null>(null)
  const [search, setSearch] = useState<Record<Tab, string>>({ photos: '', files: '' })
  const [type, setType] = useState<Record<Tab, string>>({ photos: '', files: '' })
  const [deleted, setDeleted] = useState<Set<string>>(new Set())
  const [confirmTrash, setConfirmTrash] = useState<{ message: ReactNode; resolve: (ok: boolean) => void } | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [showUpload, setShowUpload] = useState(false)
  const [previewFile, setPreviewFile] = useState<DriveFile | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const displayDrives = useMemo(() => drives.map(toDisplayDrive), [drives])

  // Re-render when the next token expires so that drive is dropped and the reconnect banner appears
  const [now, setNow] = useState(Date.now)
  const expiredDrives = useMemo(() => drives.filter((d) => localDriveApi.isTokenExpired(d, now)), [drives, now])
  useEffect(() => {
    const next = Math.min(...drives.filter((d) => !localDriveApi.isTokenExpired(d, now)).map((d) => d.tokenExpiry))
    if (!Number.isFinite(next)) return
    const timer = setTimeout(() => setNow(Date.now()), next - 60_000 - Date.now() + 1000)
    return () => clearTimeout(timer)
  }, [drives, now])

  const targetDrives = useMemo(
    () =>
      drives.filter(
        (d) => (!selectedDriveId || d.id === selectedDriveId) && !localDriveApi.isTokenExpired(d, now)
      ),
    [drives, selectedDriveId, now]
  )
  const [reconnecting, setReconnecting] = useState<string | null>(null)
  const reconnect = async (email: string) => {
    setReconnecting(email)
    try {
      await localDriveApi.startGoogleConnect(email)
    } catch {
      setReconnecting(null)
      alert('Could not start sign-in. Is the server running?')
    }
  }

  // Both tabs stay mounted; remember each one's window scroll position
  const scrollY = useRef<Record<Tab, number>>({ photos: 0, files: 0 })
  const switchTab = (t: Tab) => {
    scrollY.current[tab] = window.scrollY
    setTab(t)
  }
  useLayoutEffect(() => {
    window.scrollTo(0, scrollY.current[tab])
  }, [tab])

  const selectDrive = (id: string | null) => {
    scrollY.current = { photos: 0, files: 0 }
    setSelectedDriveId(id)
  }

  const deleteFiles = async (list: DriveFile[]) => {
    if (!list.length) return false
    const what = list.length === 1 ? list[0].name : `${list.length} items`
    const ok = await new Promise<boolean>((resolve) =>
      setConfirmTrash({
        message: (
          <>
            <strong className="font-semibold text-gray-900">{what}</strong> will be moved to Google Drive trash. You can
            restore {list.length === 1 ? 'it' : 'them'} from there for 30 days.
          </>
        ),
        resolve,
      })
    )
    if (!ok) return false
    const results = await Promise.allSettled(
      list.map(async (file) => {
        const drive = drives.find((d) => d.id === file.driveAccountId)
        if (!drive) throw new Error('Drive not connected')
        await localDriveApi.deleteFile(drive, file.id)
        return fileKey(file)
      })
    )
    const done = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
    setDeleted((prev) => new Set([...prev, ...done]))
    if (done.length < list.length) alert(`Failed to move ${list.length - done.length} item(s) to trash.`)
    return done.length > 0
  }
  const handleDelete = (file: DriveFile) => deleteFiles([file])

  const previewRequest = useRef(0)

  const handlePreview = async (file: DriveFile) => {
    const drive = drives.find((d) => d.id === file.driveAccountId)
    if (!drive) return
    const id = ++previewRequest.current
    setPreviewFile(file)

    // Images: a screen-sized Drive thumbnail shows instantly instead of downloading the original
    if (file.mimeType.startsWith('image/') && file.thumbnailLink) {
      const px = Math.min(4096, Math.round(Math.max(window.innerWidth, window.innerHeight) * devicePixelRatio))
      setPreviewUrl(localDriveApi.sizedThumbnail(file.thumbnailLink, `s${px}`))
      return
    }

    setPreviewUrl(null)
    try {
      const url = await localDriveApi.getFileUrl(drive, file.id)
      if (id === previewRequest.current) setPreviewUrl(url)
      else URL.revokeObjectURL(url) // closed or switched before the download finished
    } catch {
      if (id !== previewRequest.current) return
      setPreviewFile(null)
      alert('Failed to load preview. Your Google session may have expired — reconnect the drive.')
    }
  }

  const closePreview = () => {
    previewRequest.current++
    if (previewUrl?.startsWith('blob:')) URL.revokeObjectURL(previewUrl)
    setPreviewFile(null)
    setPreviewUrl(null)
  }

  const typeFilter = (t: Tab) => (type[t] ? TYPE_FILTERS[t][type[t]] : undefined)

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-gray-100">
      <Navbar />
      <div className="mx-auto max-w-screen-2xl px-4 py-6 sm:px-6">
        <div className="mb-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div role="tablist" aria-label="Library" className="flex self-start rounded-xl bg-gray-100 p-1">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => switchTab(t.id)}
                  className={`flex items-center gap-2 rounded-lg px-5 py-2 text-base font-semibold transition-colors ${
                    tab === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {t.icon}
                  {t.label}
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                type="text"
                aria-label={`Search ${tab}`}
                placeholder={tab === 'photos' ? 'Search photos...' : 'Search files...'}
                value={search[tab]}
                onChange={(e) => setSearch({ ...search, [tab]: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 sm:w-60"
              />
              <select
                aria-label="Filter by type"
                value={type[tab]}
                onChange={(e) => setType({ ...type, [tab]: e.target.value })}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 sm:w-auto"
              >
                <option value="">All types</option>
                {Object.keys(TYPE_FILTERS[tab]).map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
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

        {drives.length === 0 ? (
          <div className="flex min-h-[420px] flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-white py-20 text-center">
            <p className="mb-4 text-4xl">☁️</p>
            <h3 className="mb-2 text-lg font-semibold text-gray-900">No drives connected</h3>
            <p className="mb-6 text-gray-500">Connect a Google Drive account to see your files here.</p>
            <Link to="/drives" className="rounded-lg bg-blue-600 px-6 py-2.5 font-medium text-white transition-colors hover:bg-blue-700">
              Connect Drive
            </Link>
          </div>
        ) : (
          <>
            {expiredDrives.length > 0 && (
              <div role="alert" className="mb-4 space-y-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 sm:p-4">
                {expiredDrives.map((d) => (
                  <div key={d.id} className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                    <p className="text-sm text-amber-800">
                      Session for <span className="font-semibold" title={d.accountEmail}>{username(d.accountEmail)}</span> expired. Its files are hidden until you reconnect.
                    </p>
                    <button
                      onClick={() => reconnect(d.accountEmail)}
                      disabled={reconnecting !== null}
                      className="shrink-0 rounded-lg bg-amber-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
                    >
                      {reconnecting === d.accountEmail ? 'Redirecting…' : 'Reconnect'}
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm sm:p-4">
              <DriveChip drives={displayDrives} selectedDriveId={selectedDriveId} onSelect={selectDrive} />
            </div>

            <div role="tabpanel" hidden={tab !== 'photos'}>
              <PhotosView
                drives={targetDrives}
                search={search.photos}
                typeFilter={typeFilter('photos')}
                hidden={deleted}
                reloadKey={reloadKey}
                onDelete={deleteFiles}
              />
            </div>
            <div role="tabpanel" hidden={tab !== 'files'}>
              <FilesView
                key={selectedDriveId ?? 'all'}
                drives={targetDrives}
                search={search.files}
                typeFilter={typeFilter('files')}
                hidden={deleted}
                reloadKey={reloadKey}
                onPreview={handlePreview}
                onDelete={handleDelete}
              />
            </div>
          </>
        )}
      </div>

      {showUpload && (
        <LocalUploadModal
          drives={drives}
          onClose={() => setShowUpload(false)}
          onUploaded={() => setReloadKey((k) => k + 1)}
        />
      )}
      {previewFile && (
        <FilePreviewModal
          file={previewFile}
          onClose={closePreview}
          overridePreviewUrl={previewUrl ?? ''}
          loading={!previewUrl}
          onDelete={async (f) => {
            if (await handleDelete(f)) closePreview()
          }}
        />
      )}
      {confirmTrash && (
        <ConfirmDialog
          title="Move to trash?"
          message={confirmTrash.message}
          confirmLabel="Move to trash"
          onResult={(ok) => {
            confirmTrash.resolve(ok)
            setConfirmTrash(null)
          }}
        />
      )}
    </div>
  )
}

export default LocalDashboard
