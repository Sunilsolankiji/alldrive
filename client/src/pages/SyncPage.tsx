import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLocalAccount } from '../context/LocalAccountContext'
import { syncLocalAccount, loginUser } from '../api/auth'
import { syncTokenKey } from '../utils/syncToken'

const SyncPage = () => {
  const { account } = useLocalAccount()
  const navigate = useNavigate()

  // Per-account sync token — different local accounts are independent
  const tokenKey = account ? syncTokenKey(account.id) : ''
  const alreadySynced = tokenKey ? !!localStorage.getItem(tokenKey) : false

  const [mode, setMode] = useState<'sync' | 'signin'>(alreadySynced ? 'signin' : 'sync')
  const [name, setName] = useState(account?.name ?? '')
  const [email, setEmail] = useState(account?.email ?? '')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const handleSync = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data } = await syncLocalAccount({ name, email, password })
      localStorage.setItem(tokenKey, data.token!)
      setSuccess(true)
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number; data?: { message?: string } } }
      const status = axiosErr.response?.status
      if (status && status >= 500) setError('Something went wrong. Please try again.')
      else setError(axiosErr.response?.data?.message || 'Sync failed')
    } finally {
      setLoading(false)
    }
  }

  const handleSignin = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data } = await loginUser({ email, password })
      localStorage.setItem(tokenKey, data.token!)
      setSuccess(true)
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number; data?: { message?: string } } }
      const status = axiosErr.response?.status
      if (status && status >= 500) setError('Something went wrong. Please try again.')
      else setError(axiosErr.response?.data?.message || 'Sign in failed')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-blue-50 via-white to-slate-100 px-4">
        <div className="w-full max-w-md rounded-3xl border border-gray-200 bg-white p-10 shadow-xl text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-100">
            <svg className="w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Account synced!</h2>
          <p className="text-gray-500 text-sm mb-6">
            You can now sign in from any device using your email and password. Your local data stays here too.
          </p>
          <button
            onClick={() => navigate('/dashboard')}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-blue-50 via-white to-slate-100 px-4 py-6">
      <div className="mx-auto grid w-full max-w-5xl overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-xl md:grid-cols-2">
        {/* Left panel */}
        <div className="hidden md:flex flex-col justify-between bg-blue-600 p-8 text-white">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-blue-100">Optional</p>
            <h2 className="mt-3 text-3xl font-bold">Sync across devices</h2>
            <p className="mt-3 text-blue-100">
              Your local account is great for one device. Sync it to access your drives from anywhere.
            </p>
            <ul className="mt-6 space-y-2 text-sm text-blue-100">
              <li>✓ Sign in from any device</li>
              <li>✓ Your local data stays on this device too</li>
              <li>✓ You control when to sync</li>
            </ul>
          </div>
          <p className="text-sm text-blue-100">AllDrive</p>
        </div>

        {/* Right panel */}
        <div className="w-full p-8 sm:p-10">
          <div className="text-center mb-6">
            <div className="inline-flex items-center gap-2 rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700 mb-3">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
              </svg>
              Cross-device sync
            </div>
            <h1 className="text-2xl font-bold text-gray-900">
              {mode === 'sync' ? 'Sync your account' : 'Sign in to synced account'}
            </h1>
          </div>

          {/* Mode toggle */}
          <div className="flex rounded-lg border border-gray-200 mb-6 overflow-hidden">
            <button
              onClick={() => { setMode('sync'); setError('') }}
              className={`flex-1 py-2 text-sm font-medium transition-colors ${mode === 'sync' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              Create sync account
            </button>
            <button
              onClick={() => { setMode('signin'); setError('') }}
              className={`flex-1 py-2 text-sm font-medium transition-colors ${mode === 'signin' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              Already synced
            </button>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">{error}</div>
          )}

          {mode === 'sync' ? (
            <form onSubmit={handleSync} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} required
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8}
                  placeholder="Min. 8 characters"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
              </div>
              <button type="submit" disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition-colors">
                {loading ? 'Syncing…' : 'Sync to all devices'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleSignin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
              </div>
              <button type="submit" disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition-colors">
                {loading ? 'Signing in…' : 'Sign In'}
              </button>
            </form>
          )}

          <div className="mt-6 text-center">
            <Link to="/dashboard" className="text-sm text-gray-500 hover:text-gray-700">
              ← Back to dashboard
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SyncPage
