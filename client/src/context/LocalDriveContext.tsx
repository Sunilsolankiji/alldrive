import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import axios from 'axios'
import { App as CapApp } from '@capacitor/app'
import * as localDriveApi from '../api/localDrive'
import { isNativeApp, PhotoBackup } from '../api/photoBackup'
import type { LocalDriveAccount } from '../types'

const STORAGE_KEY = 'alldrive_local_drives'

interface LocalDriveContextType {
  drives: LocalDriveAccount[]
  addDrive: (drive: LocalDriveAccount) => void
  removeDrive: (id: string) => void
  /** Android app only: why the last Google sign-in failed, '' otherwise. */
  connectError: string
  clearConnectError: () => void
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
      // Replace in place if the same account reconnects or its token was refreshed
      const next = prev.some((d) => d.accountEmail === drive.accountEmail)
        ? prev.map((d) => (d.accountEmail === drive.accountEmail ? drive : d))
        : [...prev, drive]
      save(next)
      return next
    })
  }, [])

  const removeDrive = useCallback((id: string) => {
    setDrives((prev) => {
      const gone = prev.find((d) => d.id === id)
      if (gone && isNativeApp) void PhotoBackup.removeAccount({ email: gone.accountEmail })
      const next = prev.filter((d) => d.id !== id)
      save(next)
      return next
    })
  }, [])

  // Android app: finish Google sign-in when the deep link returns, and keep access tokens
  // fresh using the refresh token held in native storage (web tokens can't be refreshed).
  const [connectError, setConnectError] = useState('')
  useEffect(() => {
    if (!isNativeApp) return
    const refreshDue = async () => {
      for (const d of load()) {
        if (d.tokenExpiry - Date.now() > 5 * 60_000) continue
        try {
          // tokenExpiry 0 means Google rejected the token, so don't reuse the cached one
          const { accessToken, expiresAt } = await PhotoBackup.getAccessToken({ email: d.accountEmail, force: d.tokenExpiry === 0 })
          addDrive({ ...d, accessToken, tokenExpiry: expiresAt })
        } catch {
          // No stored token or access revoked: the existing reconnect banner handles it
        }
      }
    }
    void refreshDue()
    const timer = setInterval(() => void refreshDue(), 60_000)
    const listeners = [
      CapApp.addListener('resume', () => void refreshDue()),
      CapApp.addListener('appUrlOpen', ({ url }) => {
        localDriveApi
          .finishNativeGoogleConnect(url)
          .then((drive) => {
            if (!drive) return
            setConnectError('')
            addDrive(drive)
          })
          .catch((err: unknown) => {
            const res = (err as { response?: { data?: { message?: string } } }).response
            setConnectError(res?.data?.message || (err as Error).message || 'Could not connect the account.')
          })
      }),
    ]
    return () => {
      clearInterval(timer)
      for (const l of listeners) void l.then((h) => h.remove())
    }
  }, [addDrive])

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
    <LocalDriveContext.Provider value={{ drives, addDrive, removeDrive, connectError, clearConnectError: () => setConnectError('') }}>
      {children}
    </LocalDriveContext.Provider>
  )
}

export const useLocalDrives = () => {
  const ctx = useContext(LocalDriveContext)
  if (!ctx) throw new Error('useLocalDrives must be used within LocalDriveProvider')
  return ctx
}
