import { useEffect, useState } from 'react'
import { useLocalDrives } from '../context/LocalDriveContext'
import { startGoogleConnect } from '../api/localDrive'
import Navbar from '../components/Navbar'
import { username } from '../utils/username'
import Avatar from '../components/Avatar'
import ConfirmDialog from '../components/ConfirmDialog'
import type { LocalDriveAccount } from '../types'

const LocalDrives = () => {
  const { drives, removeDrive } = useLocalDrives()
  const [connecting, setConnecting] = useState(false)
  const [pendingDisconnect, setPendingDisconnect] = useState<LocalDriveAccount | null>(null)

  // Reset connecting state if user navigates back (bfcache restore)
  useEffect(() => {
    const reset = (e: PageTransitionEvent) => { if (e.persisted) setConnecting(false) }
    window.addEventListener('pageshow', reset)
    return () => window.removeEventListener('pageshow', reset)
  }, [])

  const handleConnect = async () => {
    setConnecting(true)
    try {
      await startGoogleConnect()
    } catch {
      setConnecting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-gray-100">
      <Navbar />
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-col justify-between gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Connected Drives</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              Local mode — tokens stay on this device only
            </p>
          </div>
          <button
            onClick={handleConnect}
            disabled={connecting}
            className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {connecting ? 'Redirecting…' : (
              <>
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Add Drive
              </>
            )}
          </button>
        </div>

        {drives.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-12 text-center shadow-sm">
            <p className="text-4xl mb-4">☁️</p>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No drives connected</h3>
            <p className="text-gray-500 mb-6 text-sm">
              Connect a Google Drive account. Your tokens stay on this device only — nothing is stored on our servers.
            </p>
            <button
              onClick={handleConnect}
              disabled={connecting}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg font-medium text-sm transition-colors"
            >
              Connect Google Drive
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {drives.map((drive) => (
              <div
                key={drive.id}
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

        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-400 text-center">
            🔒 Local mode — tokens are stored in your browser only and never sent to our servers.
          </p>
        </div>
      </div>
      {pendingDisconnect && (
        <ConfirmDialog
          title="Disconnect drive?"
          message={
            <>
              <strong className="font-semibold text-gray-900">{pendingDisconnect.accountEmail}</strong> will be removed from this
              browser. Files in Google Drive are not affected.
            </>
          }
          confirmLabel="Disconnect"
          danger
          onResult={(ok) => {
            if (ok) removeDrive(pendingDisconnect.id)
            setPendingDisconnect(null)
          }}
        />
      )}
    </div>
  )
}

export default LocalDrives
