import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import * as localAccountDb from '../services/localAccountDb'
import type { LocalAccount } from '../services/localAccountDb'

const SESSION_KEY = 'alldrive_local_session'

interface LocalAccountContextType {
  account: LocalAccount | null
  loading: boolean
  register: (name: string, email: string, password: string) => Promise<void>
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const LocalAccountContext = createContext<LocalAccountContextType | null>(null)

export const LocalAccountProvider = ({ children }: { children: ReactNode }) => {
  const [account, setAccount] = useState<LocalAccount | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem(SESSION_KEY)
    if (!token) { setLoading(false); return }
    localAccountDb.resolveSession(token)
      .then((acc) => setAccount(acc))
      .catch(() => localStorage.removeItem(SESSION_KEY))
      .finally(() => setLoading(false))
  }, [])

  const register = useCallback(async (name: string, email: string, password: string) => {
    const acc = await localAccountDb.createAccount(name, email, password)
    const token = await localAccountDb.createSession(acc.id)
    localStorage.setItem(SESSION_KEY, token)
    setAccount(acc)
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const acc = await localAccountDb.verifyAccount(email, password)
    const token = await localAccountDb.createSession(acc.id)
    localStorage.setItem(SESSION_KEY, token)
    setAccount(acc)
  }, [])

  const logout = useCallback(async () => {
    const token = localStorage.getItem(SESSION_KEY)
    if (token) await localAccountDb.deleteSession(token)
    localStorage.removeItem(SESSION_KEY)
    setAccount(null)
  }, [])

  return (
    <LocalAccountContext.Provider value={{ account, loading, register, login, logout }}>
      {children}
    </LocalAccountContext.Provider>
  )
}

export const useLocalAccount = () => {
  const ctx = useContext(LocalAccountContext)
  if (!ctx) throw new Error('useLocalAccount must be used within LocalAccountProvider')
  return ctx
}
