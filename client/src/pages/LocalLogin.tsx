import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLocalAccount } from '../context/LocalAccountContext'

const LocalLogin = () => {
  const { login } = useLocalAccount()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
      navigate('/dashboard')
    } catch (err: unknown) {
      setError((err as Error).message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-blue-50 via-white to-slate-100 px-4 py-6">
      <div className="mx-auto grid w-full max-w-5xl overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-xl md:grid-cols-2">
        <div className="hidden md:flex flex-col justify-between bg-emerald-600 p-8 text-white">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-emerald-100">Privacy First</p>
            <h2 className="mt-3 text-3xl font-bold">Local Account</h2>
            <p className="mt-3 text-emerald-100">Your account lives only on this device. No data is ever sent to our servers.</p>
            <ul className="mt-6 space-y-2 text-sm text-emerald-100">
              <li>✓ Credentials stored in your browser's local database</li>
              <li>✓ Google Drive tokens never leave this device</li>
              <li>✓ No email required on our end</li>
            </ul>
          </div>
          <p className="text-sm text-emerald-100">AllDrive · Local Mode</p>
        </div>
        <div className="w-full p-8 sm:p-10">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700 mb-3">
              🔒 On-device only
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Sign in — Local Account</h1>
            <p className="text-gray-500 mt-1 text-sm">Your credentials are stored on this device only</p>
          </div>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">{error}</div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                placeholder="••••••••"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition-colors"
            >
              {loading ? 'Signing in…' : 'Sign In Locally'}
            </button>
          </form>
          <p className="text-center text-sm text-gray-600 mt-6">
            No local account yet?{' '}
            <Link to="/register" className="text-emerald-600 hover:underline font-medium">
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

export default LocalLogin
