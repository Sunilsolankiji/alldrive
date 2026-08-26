import { type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useLocalAccount } from '../context/LocalAccountContext'

const LocalProtectedRoute = ({ children }: { children: ReactNode }) => {
  const { account, loading } = useLocalAccount()
  if (loading) return <div className="flex min-h-screen items-center justify-center text-gray-400">Loading…</div>
  return account ? <>{children}</> : <Navigate to="/login" replace />
}

export default LocalProtectedRoute
