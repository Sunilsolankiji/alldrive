import { Link, useNavigate } from 'react-router-dom'
import { useLocalAccount } from '../context/LocalAccountContext'
import { useUploads } from '../context/UploadContext'
import { syncTokenKey } from '../utils/syncToken'
import { isNativeApp } from '../api/photoBackup'

const Navbar = () => {
  const { account, logout } = useLocalAccount()
  const { items } = useUploads()
  const navigate = useNavigate()
  const isSynced = account ? !!localStorage.getItem(syncTokenKey(account.id)) : false
  const busyUploads = items.filter((i) => i.status === 'pending' || i.status === 'uploading').length

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const initial = account?.name?.charAt(0).toUpperCase()

  return (
    <nav aria-label="Main" className="sticky top-0 z-40 border-b border-gray-200/80 bg-white/90 pt-[env(safe-area-inset-top)] backdrop-blur">
      {/* Phones: links drop to their own row so nothing overflows; sm+: one row */}
      <div className="mx-auto flex w-full max-w-screen-2xl flex-wrap items-center justify-between gap-y-1 px-4 py-2 sm:flex-nowrap sm:px-6 sm:py-3">
        <Link to="/dashboard" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 shadow-sm">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
          </div>
          <span className="text-xl font-bold text-gray-900">AllDrive</span>
        </Link>

        <div className="order-last flex w-full items-center justify-around gap-1 border-t border-gray-100 pt-1 sm:order-none sm:ml-auto sm:mr-3 sm:w-auto sm:justify-end sm:gap-3 sm:border-0 sm:pt-0">
          <Link
            to="/uploads"
            className="relative flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-blue-600 sm:min-h-0 sm:py-1.5"
          >
            Uploads
            {busyUploads > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-semibold text-white">
                {busyUploads}
              </span>
            )}
          </Link>

          <Link
            to="/drives"
            className="flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-blue-600 sm:min-h-0 sm:py-1.5"
          >
            My Drives
          </Link>

          {isNativeApp && (
            <Link
              to="/backup"
              className="flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-blue-600 sm:min-h-0 sm:py-1.5"
            >
              Backup
            </Link>
          )}
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* Sync button */}
          {isSynced ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-600">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
              </svg>
              <span className="hidden sm:inline">Synced</span>
            </span>
          ) : (
            <Link
              to="/sync"
              aria-label="Sync to all devices"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-100 sm:min-h-0 sm:py-1.5"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
              </svg>
              <span className="hidden sm:inline">Sync to all devices</span>
            </Link>
          )}

          <div className="flex items-center gap-2 border-l border-gray-200 pl-3">
            {initial && (
              <>
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100">
                  <span className="text-sm font-semibold text-emerald-600">{initial}</span>
                </div>
                <span className="hidden text-sm font-medium text-gray-700 sm:block">{account?.name}</span>
              </>
            )}
            <button
              onClick={() => void handleLogout()}
              className="min-h-11 rounded px-2 text-sm text-gray-600 transition-colors hover:bg-red-50 hover:text-red-600 sm:min-h-0 sm:py-1"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </nav>
  )
}

export default Navbar
