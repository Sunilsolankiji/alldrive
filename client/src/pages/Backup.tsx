import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Navbar from '../components/Navbar'
import { useLocalDrives } from '../context/LocalDriveContext'
import { isNativeApp, PhotoBackup, type BackupStatus } from '../api/photoBackup'
import { startGoogleConnect } from '../api/localDrive'

const errorMessage = (err: unknown) => (err as Error).message || 'Something went wrong. Please try again.'

const Backup = () => {
  const { drives } = useLocalDrives()
  const [status, setStatus] = useState<BackupStatus | null>(null)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const refresh = useCallback(async () => {
    try {
      setStatus(await PhotoBackup.getStatus())
    } catch (err) {
      setError(errorMessage(err))
    }
  }, [])

  useEffect(() => {
    if (!isNativeApp) return
    void refresh()
    const timer = setInterval(() => void refresh(), 3000)
    return () => clearInterval(timer)
  }, [refresh])

  const account = email || status?.accountEmail || drives[0]?.accountEmail || ''

  /** Runs a plugin action with one busy flag so buttons can't be double-pressed. */
  const act = async (fn: () => Promise<BackupStatus | void>, done = '') => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const next = await fn()
      if (next) setStatus(next)
      if (done) setNotice(done)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const turnOn = () =>
    act(async () => {
      let s = await PhotoBackup.getStatus()
      if (s.mediaPermission !== 'granted') s = await PhotoBackup.requestMediaPermissions()
      if (s.mediaPermission !== 'granted') {
        setStatus(s)
        throw new Error('AllDrive needs access to all your photos and videos to back them up.')
      }
      return PhotoBackup.enable({ email: account, wifiOnly: status?.wifiOnly ?? true })
    }, 'Backup is on. New photos and videos will upload automatically.')

  if (!isNativeApp) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-gray-100">
        <Navbar />
        <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
          <h1 className="text-2xl font-bold text-gray-900">Photo backup</h1>
          <p className="mt-2 text-sm text-gray-600">
            Automatic photo backup works in the AllDrive Android app. Browsers can't read your gallery or run in the
            background. You can still upload photos from the <Link to="/uploads" className="text-blue-700 underline">Uploads</Link> page.
          </p>
        </main>
      </div>
    )
  }

  const lastRun = status?.lastRunAt ? new Date(status.lastRunAt).toLocaleString() : 'Never'

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-gray-100">
      <Navbar />
      <main className="mx-auto max-w-3xl space-y-4 px-4 py-6 sm:px-6 sm:py-8" aria-busy={!status}>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h1 className="text-2xl font-bold text-gray-900">Photo backup</h1>
          <p className="mt-1 text-sm text-gray-600">
            Uploads new photos and videos from this phone to Google Photos automatically, even when the app is closed.
          </p>
        </div>

        <div role="status" aria-live="polite" className="empty:hidden">
          {notice && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</p>}
        </div>
        {error && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        {!status ? (
          <p className="text-sm text-gray-500">Loading backup settings…</p>
        ) : drives.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center shadow-sm">
            <h2 className="mb-2 text-lg font-semibold text-gray-900">No accounts connected</h2>
            <p className="mb-6 text-sm text-gray-600">Connect a Google account to choose where your photos go.</p>
            <Link to="/drives" className="inline-flex min-h-11 items-center rounded-lg bg-blue-600 px-6 text-sm font-medium text-white hover:bg-blue-700">
              Connect a drive
            </Link>
          </div>
        ) : (
          <>
            <section aria-labelledby="backup-settings" className="space-y-5 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 id="backup-settings" className="text-lg font-semibold text-gray-900">Settings</h2>

              <div>
                <label htmlFor="backup-account" className="mb-1 block text-sm font-medium text-gray-700">
                  Back up to
                </label>
                <select
                  id="backup-account"
                  value={account}
                  disabled={busy || status.enabled}
                  onChange={(e) => setEmail(e.target.value)}
                  className="min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
                >
                  {drives.map((d) => (
                    <option key={d.id} value={d.accountEmail}>{d.accountEmail}</option>
                  ))}
                </select>
                {status.enabled && <p className="mt-1 text-xs text-gray-500">Turn backup off to change the account.</p>}
              </div>

              <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4">
                <span>
                  <span className="block text-sm font-medium text-gray-900">Wi‑Fi only</span>
                  <span className="block text-xs text-gray-500">Turn off to also use mobile data.</span>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  checked={status.wifiOnly}
                  disabled={busy}
                  onChange={(e) => void act(() => PhotoBackup.setWifiOnly({ wifiOnly: e.target.checked }))}
                  className="h-6 w-6 shrink-0 accent-blue-600"
                />
              </label>

              {status.enabled ? (
                <button
                  onClick={() => void act(() => PhotoBackup.disable(), 'Backup is off.')}
                  disabled={busy}
                  className="min-h-11 w-full rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Turn off backup
                </button>
              ) : (
                <button
                  onClick={() => void turnOn()}
                  disabled={busy || !account}
                  className="min-h-11 w-full rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  Turn on backup
                </button>
              )}
            </section>

            <section aria-labelledby="backup-status" className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 id="backup-status" className="text-lg font-semibold text-gray-900">Status</h2>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <dt className="text-gray-500">State</dt>
                <dd className="font-medium text-gray-900">
                  {!status.enabled ? 'Off' : status.needsReconnect ? 'Paused — reconnect needed' : status.running ? 'Backing up…' : 'On'}
                </dd>
                <dt className="text-gray-500">Uploaded</dt>
                <dd className="font-medium text-gray-900">{status.uploadedCount}</dd>
                <dt className="text-gray-500">Last run</dt>
                <dd className="font-medium text-gray-900">{lastRun}</dd>
              </dl>
              {status.lastError && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{status.lastError}</p>}

              {status.needsReconnect && (
                <button
                  onClick={() => void act(() => startGoogleConnect(status.accountEmail, true))}
                  disabled={busy}
                  className="min-h-11 w-full rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  Reconnect {status.accountEmail}
                </button>
              )}

              {status.mediaPermission !== 'granted' && (
                <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <p>Photo access is off. Allow access to <strong>all</strong> photos and videos so backup can see new ones.</p>
                  <button
                    onClick={() =>
                      void act(() => (status.mediaPermission === 'denied' ? PhotoBackup.openSettings() : PhotoBackup.requestMediaPermissions()))
                    }
                    disabled={busy}
                    className="min-h-11 rounded-lg border border-amber-300 bg-white px-4 font-medium hover:bg-amber-100 disabled:opacity-50"
                  >
                    {status.mediaPermission === 'denied' ? 'Open settings' : 'Allow access'}
                  </button>
                </div>
              )}

              {status.enabled && (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    onClick={() => void act(() => PhotoBackup.backupNow(), 'Backup started. It runs when the network setting allows.')}
                    disabled={busy || status.running}
                    className="min-h-11 flex-1 rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Back up now
                  </button>
                  <button
                    onClick={() =>
                      void act(() => PhotoBackup.backupExisting(), 'Backing up photos already on this phone. Ones already backed up are skipped.')
                    }
                    disabled={busy || status.running}
                    className="min-h-11 flex-1 rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Back up existing photos
                  </button>
                </div>
              )}
            </section>

            <p className="text-center text-xs text-gray-500">
              🔒 Your sign-in stays encrypted on this phone. Photos go straight from your phone to Google — never through the AllDrive server.
            </p>
          </>
        )}
      </main>
    </div>
  )
}

export default Backup
