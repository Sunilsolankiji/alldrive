import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
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
