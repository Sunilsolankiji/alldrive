import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const Login = () => {
  const { login } = useAuth()
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
      const axiosErr = err as { response?: { status?: number; data?: { message?: string } } }
      const status = axiosErr.response?.status
      if (status && status >= 500) {
        setError('Something went wrong. Please try again.')
      } else {
        setError(axiosErr.response?.data?.message || 'Login failed')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-blue-50 via-white to-slate-100 px-4 py-6">
      <div className="mx-auto grid w-full max-w-5xl overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-xl md:grid-cols-2">
        <div className="hidden md:flex flex-col justify-between bg-blue-600 p-8 text-white">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-blue-100">Welcome</p>
            <h2 className="mt-3 text-3xl font-bold">Your drives, one workspace.</h2>
            <p className="mt-3 text-blue-100">Browse photos, videos, PDFs, and every file type in one clean dashboard.</p>
          </div>
          <p className="text-sm text-blue-100">AllDrive</p>
        </div>
      <div className="w-full p-8 sm:p-10">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">AllDrive</h1>
          <p className="text-gray-500 mt-1">Sign in to your account</p>
        </div>
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
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
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition-colors"
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
        <p className="text-center text-sm text-gray-600 mt-6">
          Don't have an account?{' '}
          <Link to="/register" className="text-blue-600 hover:underline font-medium">
            Sign up
          </Link>
        </p>
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-200" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-white px-2 text-gray-400 tracking-wider">or</span>
          </div>
        </div>
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => navigate('/local/login')}
            className="w-full rounded-lg border border-emerald-300 bg-emerald-50 py-2.5 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
          >
            🔒 Sign in with local account
          </button>
          <button
            type="button"
            onClick={() => navigate('/local/register')}
            className="w-full rounded-lg border border-gray-300 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
          >
            Create local account (on-device only)
          </button>
        </div>
        <p className="mt-3 text-center text-xs text-gray-400">
          Local accounts are stored only on this device — nothing is sent to our servers.
        </p>
      </div>
      </div>
    </div>
  )
}

export default Login
