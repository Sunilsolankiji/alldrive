import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import axios from 'axios'
import type { LocalDriveAccount } from '../types'

const STORAGE_KEY = 'alldrive_local_drives'

interface LocalDriveContextType {
  drives: LocalDriveAccount[]
  addDrive: (drive: LocalDriveAccount) => void
  removeDrive: (id: string) => void
}

const LocalDriveContext = createContext<LocalDriveContextType | null>(null)

const load = (): LocalDriveAccount[] => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as LocalDriveAccount[]
  } catch {
    return []
  }
}

const save = (drives: LocalDriveAccount[]) =>
  localStorage.setItem(STORAGE_KEY, JSON.stringify(drives))

export const LocalDriveProvider = ({ children }: { children: ReactNode }) => {
  const [drives, setDrives] = useState<LocalDriveAccount[]>(load)

  const addDrive = useCallback((drive: LocalDriveAccount) => {
    setDrives((prev) => {
      // Replace if same account reconnects
      const filtered = prev.filter((d) => d.accountEmail !== drive.accountEmail)
      const next = [...filtered, drive]
      save(next)
      return next
    })
  }, [])

  const removeDrive = useCallback((id: string) => {
    setDrives((prev) => {
      const next = prev.filter((d) => d.id !== id)
      save(next)
      return next
    })
  }, [])

  // A token can die before its stored expiry (access revoked, re-signed in elsewhere, clock skew).
  // Google then answers 401; mark that drive expired so the reconnect banner takes over instead of
  // every view repeatedly failing with "invalid authentication credentials".
  useEffect(() => {
    const id = axios.interceptors.response.use(undefined, (err) => {
      const host = (() => { try { return new URL(err.config?.url ?? '').hostname } catch { return '' } })()
      const token = String(err.config?.headers?.Authorization ?? '').replace(/^Bearer /, '')
      if (err.response?.status === 401 && host.endsWith('.googleapis.com') && token) {
        setDrives((prev) => {
          if (!prev.some((d) => d.accessToken === token && d.tokenExpiry)) return prev
          const next = prev.map((d) => (d.accessToken === token ? { ...d, tokenExpiry: 0 } : d))
          save(next)
          return next
        })
      }
      return Promise.reject(err)
    })
    return () => axios.interceptors.response.eject(id)
  }, [])

  return (
    <LocalDriveContext.Provider value={{ drives, addDrive, removeDrive }}>
      {children}
    </LocalDriveContext.Provider>
  )
}

export const useLocalDrives = () => {
  const ctx = useContext(LocalDriveContext)
  if (!ctx) throw new Error('useLocalDrives must be used within LocalDriveProvider')
  return ctx
}
