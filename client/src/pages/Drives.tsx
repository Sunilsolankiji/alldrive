import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { connectDrive, disconnectDrive, getDrives } from '../api/drives'
import Navbar from '../components/Navbar'
import type { DriveAccount } from '../types'
import { username } from '../utils/username'
import Avatar from '../components/Avatar'
import ConfirmDialog from '../components/ConfirmDialog'

const Drives = () => {
  const [drives, setDrives] = useState<DriveAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [pendingDisconnect, setPendingDisconnect] = useState<DriveAccount | null>(null)
  const location = useLocation()

  const fetchDrives = async () => {
    try {
      const res = await getDrives()
      setDrives(res.data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDrives()
    const params = new URLSearchParams(location.search)
    if (params.get('connected') === '1') {
      window.history.replaceState({}, '', '/drives')
    }
  }, [location.search])

  const handleConnect = async () => {
    setConnecting(true)
    try {
      const res = await connectDrive()
      window.location.href = res.data.url
    } catch {
      setConnecting(false)
    }
  }

  const handleDisconnect = async (id: string) => {
    try {
      await disconnectDrive(id)
      setDrives((prev) => prev.filter((d) => d._id !== id))
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-gray-100">
      <Navbar />
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-col justify-between gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Connected Drives</h2>
            <p className="text-sm text-gray-500 mt-0.5">Manage your Google Drive accounts</p>
          </div>
          <button
            onClick={handleConnect}
            disabled={connecting}
            className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {connecting ? (
              'Redirecting…'
            ) : (
              <>
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Add Drive
              </>
            )}
          </button>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="animate-pulse rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-gray-200 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-200 rounded w-1/3" />
                    <div className="h-3 bg-gray-200 rounded w-1/2" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : drives.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-12 text-center shadow-sm">
            <p className="text-4xl mb-4">☁️</p>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No drives connected</h3>
            <p className="text-gray-500 mb-6 text-sm">
              Click "Add Drive" to connect your first Google Drive account.
            </p>
            <button
              onClick={handleConnect}
              disabled={connecting}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg font-medium text-sm transition-colors"
            >
              Connect Google Drive
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {drives.map((drive) => (
              <div
                key={drive._id}
                className="flex items-center justify-between gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <Avatar src={drive.profilePicture} email={drive.accountEmail} className="h-12 w-12 text-lg" />
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{username(drive.accountEmail)}</p>
                    <p className="text-sm text-gray-500 truncate">{drive.accountEmail}</p>
                  </div>
                </div>
                <button
                  onClick={() => setPendingDisconnect(drive)}
                  className="flex-shrink-0 rounded-lg px-3 py-1.5 text-sm text-red-500 transition-colors hover:bg-red-50 hover:text-red-700"
                >
                  Disconnect
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      {pendingDisconnect && (
        <ConfirmDialog
          title="Disconnect drive?"
          message={
            <>
              <strong className="font-semibold text-gray-900">{pendingDisconnect.accountEmail}</strong> will be removed from
              AllDrive. Files in Google Drive are not affected.
            </>
          }
          confirmLabel="Disconnect"
          danger
          onResult={(ok) => {
            if (ok) void handleDisconnect(pendingDisconnect._id)
            setPendingDisconnect(null)
          }}
        />
      )}
    </div>
  )
}

export default Drives
